"""Desktop boundaries exercised by the DL0 display probe."""

from itertools import count
from types import SimpleNamespace


def ignore(*args, **kwargs):
    pass


class Sizer:
    """The layouts run, but pixel placement is outside this experiment."""

    def __init__(self, *args):
        pass

    Add = Insert = AddGrowableCol = AddStretchSpacer = Show = Hide = ShowItems = ignore


class Control:
    _ids = count()

    def __init__(self, parent=None, _id=None, label="", **kwargs):
        self._id = next(self._ids)
        self.children = []
        self.Parent = parent
        if parent is not None:
            parent.children.append(self)
        self.label = label
        self.tooltip = None
        self.visible = True
        self.sizer = Sizer()
        self.labels_written = 0

    def SetLabel(self, label):
        self.label = label
        self.labels_written += 1

    def GetLabel(self):
        return self.label

    def SetToolTip(self, tooltip):
        self.tooltip = tooltip

    def Show(self, show=True):
        self.visible = show

    def Hide(self):
        self.Show(False)

    def IsShown(self):
        return self.visible

    def GetChildren(self):
        return self.children

    def GetId(self):
        return self._id

    def GetSizer(self):
        return self.sizer

    GetHeaderContentSizer = GetSizer
    Bind = Layout = InvalidateBestSize = Refresh = ignore

    def SetForegroundColour(self, colour):
        self.colour = colour

    def GetTextExtent(self, text):
        return len(text) * 7, 14


class Gauge(Control):
    def __init__(self, parent, font, count):
        super().__init__(parent)

    SetMinSize = SetFractionDigits = ignore

    def SetValueRange(self, used, total):
        self.values = (used, total)


class ImageList:
    def __init__(self):
        self.keys = {}

    def GetImageIndex(self, key, group):
        return self.keys.setdefault((key, group), len(self.keys))


class FittingView:
    def __init__(self, fit_id):
        self.fit_id = fit_id
        self.imageList = ImageList()

    def getActiveFit(self):
        return self.fit_id


class Frame:
    def __init__(self):
        self.active_fit = None
        self.additionsPane = SimpleNamespace(notebook=SimpleNamespace(Bind=ignore))
        self.statsPane = SimpleNamespace(nameViewMap={
            "resistancesViewFull": SimpleNamespace(showEffective=True),
        })

    def getActiveFit(self):
        return self.active_fit


def install():
    """Install probe-only adapters before any of the target modules import."""
    import headless
    from service.fit import Fit

    # Retain the real ViewColumn, StatsView and ContextMenu classes.
    headless.STUB_MODULES.remove("gui.viewColumn")
    headless.STUB_MODULES.update({
        "gui.builtinAdditionPanes.projectedView", "gui.chrome_tabs",
        "gui.itemStats", "gui.pyfa_gauge",
    })
    headless.NAMESPACE_PACKAGES.update({
        "gui.builtinAdditionPanes", "gui.builtinContextMenus",
    })

    import wx
    from gui import bitmap_loader, mainFrame, pyfa_gauge
    from gui.builtinAdditionPanes import projectedView  # attaches the type-check target to gui
    from service import price

    wx.PlatformInfo = ()
    wx.BoxSizer = wx.GridSizer = wx.FlexGridSizer = Sizer
    wx.StaticText = wx.StaticLine = Control
    wx.BitmapButton = lambda parent, _id, bitmap: Control(parent)
    wx.ToolTip = lambda text: text
    wx.SystemSettings = SimpleNamespace(
        GetAppearance=lambda: SimpleNamespace(IsDark=lambda: False),
        GetColour=lambda _role: wx.Colour(0, 0, 0),
    )
    bitmap_loader.BitmapLoader = SimpleNamespace(
        getStaticBitmap=lambda _name, parent, _group: Control(parent),
        getBitmap=lambda name, group: (group, name),
    )
    pyfa_gauge.PyGauge = Gauge
    price.Fit = Fit  # price stats modules re-export this imported service
    frame = Frame()
    mainFrame.MainFrame = SimpleNamespace(getInstance=lambda: frame)
    return frame
