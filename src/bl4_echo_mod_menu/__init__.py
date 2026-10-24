"""Automatic SDK entry point. Native work waits for the inventory lifecycle."""
from mods_base import Game, Library, build_mod
from .lifecycle import enable, stop
from .metadata import VERSION

mod = build_mod(
    cls=Library,
    name='ECHO Mod Menu', author='ECHO Mod Menu contributors', version=VERSION,
    description='Native ECHO mod menu. Starts automatically when the inventory opens.',
    supported_games=Game.BL4,
    options=[], keybinds=[], hooks=[], commands=[],
    on_enable=enable, on_disable=stop,
)
