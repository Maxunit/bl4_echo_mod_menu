# Icons and optional mod artwork

Available in ECHO Mod Menu **1.3.0**. Provider API v1 is unchanged.

ECHO ships its interface icons inside its own PAK. Ordinary SDK mods receive a
puzzle icon automatically. General, Keybinds and Information categories have
their own icons, with additional defaults for common category identifiers.
Icons and images are decorative: they add no selectable controller targets.

## Declare artwork without an ECHO dependency

After registering your mod, attach a plain dictionary to that exact object:

```python
mod.echo_menu_artwork = {
    "package": __name__,
    "icon": "camera",
    "header": "assets/my_logo.png",
    "category_icons": {
        "camera": "camera",
        "movement": "run",
    },
}
```

This declaration is separate from `mod.echo_menu_provider`. It works with plain
automatic SDK discovery and can be removed without affecting any setting.
No import from ECHO, registration callback, hook or timer is required.

| Field | Meaning |
| --- | --- |
| `package` | The name of the already imported Python package containing the image resources. That module must hold a reference to this registered mod object. Required only when PNG resources are used. |
| `icon` | A built-in icon name or a package-relative PNG path such as `assets/icon.png`. Optional; defaults to the puzzle icon. |
| `header` | A package-relative PNG path. Optional; shown above the selected mod's settings and information. |
| `category_icons` | Up to 64 mappings from stable category identifiers to built-in icon names. Use the provider's original identifier, such as `camera`, without ECHO's internal prefix. |

The header fits the complete image inside a 15-rem-high region with transparency
preserved. ECHO does not crop, recolor or rewrite the original file bytes.
Choose transparent PNG for a logo or an opaque wide PNG for a banner. A header
is part of the settings scroll pane and scrolls away with the introduction.

Built-in names:

`activity`, `adjustments-horizontal`, `alert-triangle`, `camera`, `car`, `check`,
`compass`, `device-floppy`, `device-gamepad`, `echo`, `info-circle`, `keyboard`,
`language`, `power`, `puzzle`, `restore`, `run`, `search`, `settings`, `target`,
`trash`.

## Folder and SDKMOD packaging

For a folder installation, include `my_mod/__init__.py` and
`my_mod/assets/my_logo.png` under `sdk_mods/`.
For an archive, put those same two paths inside `my_mod.sdkmod`, keeping exactly
one matching root folder. Include the actual PNG when building your archive.
ECHO reads it through the loaded package importer without extracting the mod.
Use forward slashes, preserve filename case and avoid absolute paths, `..`,
links outside the package and URLs.

PNG limits: 4 MiB per file, at most 4096 pixels per dimension and 8,388,608 pixels
in total. The complete inventory capture retains at most 16 MiB of distinct PNG
bytes; identical images are shared. Only static PNG containers are accepted.
ECHO checks the container, dimensions and chunk checksums; Cohtml decodes pixels.

Missing, rejected or undecodable images use the normal icon or omit the header.
They do not reject a settings provider or change a draft. Diagnostic catalog
metadata can contain `artwork.warnings` for rejected declarations or resources.
Reopen the inventory after changing an artwork declaration or image file.

## Data flow and lifetime

On inventory activation, the game thread captures declared image bytes together
with the catalog. The catalog contains only content identifiers and dimensions.
The existing loopback service returns captured PNG data on demand, protected by
the current inventory-session identifier. Its worker never reads a mod package,
imports another mod or touches SDK objects. The frontend shares each response
within the session and cancels pending requests when the panel closes.
Image completion never redraws an active field editor or changes its value.

## Validation boundary

Automated checks cover folder/archive resources, invalid declarations and PNGs,
limits, real loopback transfer, request lifetime, image fallbacks and controller
target identity. The actual BL4 Cohtml image rendering and transparency still
require an in-game test. Browser availability does not certify that renderer.
