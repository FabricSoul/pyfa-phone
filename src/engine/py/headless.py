"""Desktop dependencies needed to import pyfa's model and services headlessly."""

import builtins
import importlib.abc
import importlib.machinery
import sys
import tempfile
import types


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


def bootstrap(db_path):
    sys.dont_write_bytecode = True  # keep the submodule clean
    install_stubs()
    builtins._ = lambda s: s  # pyfa.py installs gettext's _ as a builtin
    sys._called_from_test = True  # in-memory saveddata
    import eos.config
    # Temporary fits reuse database IDs after rollback.
    eos.config.saveddataCache = False
    eos.config.gamedata_connectionstring = f'sqlite:///{db_path}'
    import config
    config.savePath = tempfile.mkdtemp(prefix='pyfa-settings-')
    import eos.db
    eos.db.saveddata_meta.create_all(eos.db.saveddata_engine)

    # These services start desktop background threads for asynchronous search and ship browsing.
    # The worker calls Market synchronously and never sends them requests.
    from service.market import SearchWorkerThread, ShipBrowserWorkerThread
    SearchWorkerThread.start = ShipBrowserWorkerThread.start = lambda self: None
