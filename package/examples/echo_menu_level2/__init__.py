"""Complete Level 2 example: SDK-owned values with optional ECHO metadata.

This settings-only example has no gameplay hooks and does not import ECHO.
"""

from mods_base import BoolOption, Game, SliderOption, build_mod


camera_enabled = BoolOption(
    "camera_enabled",
    True,
    display_name="Enable camera settings",
    description="Allow the distance setting to be edited.",
)
distance_option = SliderOption(
    "distance",
    150,
    60,
    300,
    step=10,
    is_integer=True,
    display_name="Camera distance",
    description="Example distance in centimetres; no game camera is changed.",
)

mod = build_mod(
    name="ECHO Level 2 Example",
    author="ECHO Mod Menu contributors",
    version="1.0.0",
    supported_games=Game.BL4,
    description="SDK settings with optional ECHO presentation metadata.",
    options=[camera_enabled, distance_option],
)

# Attach one stable declaration after SDK registration. These references are
# the actual registered option objects, not copies or identifier strings.
mod.echo_menu_provider = {
    "api_version": 1,
    "id": "example.echo.level2",
    "revision": 1,
    "categories": [
        {
            "id": "camera",
            "name": {"en": "Camera", "de": "Kamera"},
            "presets": [
                {
                    "id": "standard",
                    "name": {"en": "Standard", "de": "Standard"},
                    "values": {"camera_enabled": True, "distance": 150},
                },
                {
                    "id": "near",
                    "name": {"en": "Near", "de": "Nah"},
                    "values": {"camera_enabled": True, "distance": 100},
                },
                {
                    "id": "wide",
                    "name": {"en": "Wide", "de": "Weit"},
                    "values": {"camera_enabled": True, "distance": 250},
                },
            ],
        },
    ],
    "options": [
        {
            "id": "camera_enabled",
            "option": camera_enabled,
            "category": "camera",
            "name": {"en": "Enable camera settings", "de": "Kameraoptionen aktivieren"},
            "description": {
                "en": "Allow the distance setting to be edited.",
                "de": "Erlaubt das Bearbeiten der Abstandseinstellung.",
            },
            "true_text": {"en": "On", "de": "An"},
            "false_text": {"en": "Off", "de": "Aus"},
        },
        {
            "id": "distance",
            "option": distance_option,
            "category": "camera",
            "unit": "cm",
            "name": {"en": "Camera distance", "de": "Kameraabstand"},
            "description": {
                "en": "Example distance only; this mod does not move the camera.",
                "de": "Nur ein Beispielwert; diese Mod bewegt die Kamera nicht.",
            },
            "enabled_when": {"id": "camera_enabled", "equals": True},
        },
    ],
}
