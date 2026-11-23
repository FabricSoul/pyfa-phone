"""Desktop dependencies needed to import pyfa's model and services headlessly."""

import builtins
import importlib.abc
import importlib.machinery
import sys
import tempfile
import threading
import types
from functools import lru_cache, wraps


class _Dummy:
    """Absorbs any use: call, attribute, `|`, unpacking (wx.lib.newevent.NewEvent())."""
    def __init__(self, *a, **k): pass
    def __call__(self, *a, **k): return _Dummy()
    def __getattr__(self, name): return _Dummy()
    def __or__(self, other): return 0
    __ror__ = __or__
    def __iter__(self): return iter((_Dummy(), _Dummy()))


class _StubModule(types.ModuleType):
    def __getattr__(self, name):
        if name.startswith('__'):
            raise AttributeError(name)
        value = type(name, (_Dummy,), {})  # a class, so it can be subclassed too
        setattr(self, name, value)
        return value


STUB_PACKAGES = {'wx', 'requests_cache', 'requests', 'jose'}
BROWSER_CRYPTO = {'cryptography', 'cryptography.fernet'}
# pyfa GUI modules that misc.py / maxRange.py import but only use inside __init__, which we
# never call. Importing the real ones drags in the whole wx GUI (and a circular import).
STUB_MODULES = {'gui.mainFrame', 'gui.ssoLogin', 'gui.viewColumn', 'gui.bitmap_loader',
                'service.port.efs', 'service.port.port', 'service.price'}
# The package initializer registers desktop commands. The real helpers are still imported.
NAMESPACE_PACKAGES = {'gui.fitCommands'}


class _StubFinder(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def find_spec(self, name, path, target=None):
        if name in NAMESPACE_PACKAGES:
            original = importlib.machinery.PathFinder.find_spec(name, path)
            if original is not None:
                return self.namespace(name, original.submodule_search_locations)
        if sys.platform == 'emscripten' and name in BROWSER_CRYPTO:
            return importlib.machinery.ModuleSpec(name, self, is_package=name == 'cryptography')
        if name.split('.')[0] in STUB_PACKAGES or name in STUB_MODULES:
            return importlib.machinery.ModuleSpec(name, self, is_package=name not in STUB_MODULES)

    @staticmethod
    def namespace(name, locations):
        spec = importlib.machinery.ModuleSpec(name, None, is_package=True)
        spec.submodule_search_locations[:] = locations
        return spec

    def create_module(self, spec):
        mod = _StubModule(spec.name)
        if spec.name not in STUB_MODULES:
            mod.__path__ = []
        return mod

    def exec_module(self, mod):
        if mod.__name__ == 'wx':
            mod.Colour = lambda *a: a
            mod.GetTranslation = lambda s, *a, **k: s
            mod.CallAfter = lambda f, *a, **k: f(*a, **k)
        elif mod.__name__ == 'cryptography.fernet':
            class UnsupportedFernet:
                def __init__(self, *_args):
                    self.generate_key()

                @staticmethod
                def generate_key():
                    raise RuntimeError('Desktop token encryption is unavailable in the fitting worker')

            mod.Fernet = UnsupportedFernet
        elif mod.__name__ == 'gui.viewColumn':
            class ViewColumn:
                columns = {}

                def __init__(self, fittingView=None):
                    self.fittingView = fittingView

                @classmethod
                def register(cls):
                    ViewColumn.columns[cls.name] = cls
            mod.ViewColumn = ViewColumn


def install_stubs():
    sys.meta_path.insert(0, _StubFinder())


def _cache_game_query(_amount, *_keywords):
    """Use eos's configurable cache hook with a separate namespace for each query."""
    def decorate(query):
        @lru_cache(maxsize=4096)
        def cached(args, kwargs):
            return query(*args, **dict(kwargs))

        @wraps(query)
        def load(*args, **kwargs):
            use_cache = kwargs.pop('useCache', True)
            key = (args, tuple(sorted(kwargs.items())))
            try:
                hash(key)
            except TypeError:  # eos also accepts mutable lists of item IDs
                return query(*args, **kwargs)
            if not use_cache:
                return query(*args, **kwargs)
            return cached(*key)
        return load
    return decorate


def _install_package_bytecode():
    from pathlib import Path
    from site import getsitepackages
    from zipfile import ZipFile

    target = Path(getsitepackages()[0])
    with ZipFile(Path(__file__).parent) as archive:
        for name in archive.namelist():
            if name.startswith('site-bytecode/'):
                path = target / name.removeprefix('site-bytecode/')
                path.parent.mkdir(exist_ok=True)
                path.write_bytes(archive.read(name))


def bootstrap(db_path):
    sys.dont_write_bytecode = True  # keep the submodule clean
    if sys.platform == 'emscripten':
        _install_package_bytecode()
    install_stubs()
    builtins._ = lambda s: s  # pyfa.py installs gettext's _ as a builtin
    sys._called_from_test = True  # in-memory saveddata
    import eos.config
    # Temporary fits reuse database IDs after rollback.
    eos.config.saveddataCache = False
    # The stock game cache keys only by numeric arguments. Item and market group IDs overlap.
    eos.config.gamedataCache = _cache_game_query
    eos.config.gamedata_connectionstring = f'sqlite:///{db_path}'
    import config
    config.savePath = tempfile.mkdtemp(prefix='pyfa-settings-')
    import eos.db
    eos.db.saveddata_meta.create_all(eos.db.saveddata_engine)

@lru_cache(maxsize=1)
def market_service():
    from service.market import Market, SearchWorkerThread, ShipBrowserWorkerThread

    # The worker calls Market synchronously and never sends these threads requests.
    # The unused desktop search thread eagerly parses the jargon dictionary in its constructor.
    SearchWorkerThread.__init__ = threading.Thread.__init__
    SearchWorkerThread.start = ShipBrowserWorkerThread.start = lambda self: None
    return Market
