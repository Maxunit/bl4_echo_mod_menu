OPTIONALES TPS-LOGO FUER ECHO MOD MENU 1.3.0

Basis: BL4_ECHO_Mod_Menu_v100_3_Native_Tag_Config_QA.zip

Diese kleine Ergaenzung enthaelt keine vollstaendige TPS-Mod.
Zuerst ECHO Mod Menu 1.3.0 installieren und das Spiel vollstaendig beenden.
Bei Verwendung der oben genannten TPS-Integration dieses Archiv in den
Borderlands-4-Spielordner entpacken. Nur diese Dateien werden ergaenzt/ersetzt:

sdk_mods/BL4ThirdPersonPOC/echo_menu.py
sdk_mods/BL4ThirdPersonPOC/assets/BL4_TPS_LOGO_TRANSPARENT.png

Das Logo bleibt bytegleich und transparent. Die bestehende echo_menu.py wird
ausschliesslich um folgende Zuweisung in create_provider(owner) ergaenzt:

    owner.mod.echo_menu_artwork = {
        'package': owner.__name__,
        'icon': 'camera',
        'header': 'assets/BL4_TPS_LOGO_TRANSPARENT.png',
    }

Bei einer neueren oder selbst bearbeiteten echo_menu.py die Datei behalten und
nur diese Zuweisung nach "settings = Settings(owner)" einfuegen; das PNG in den
angegebenen assets-Ordner kopieren. Die Hashes der Zielbasis stehen in manifest.json.

Danach Spiel neu starten, Inventar oeffnen, Mods und die TPS-Mod auswaehlen.
Bitte Logo-Transparenz, Kategorie-Icons und D-Pad/Confirm/Cancel im Spiel pruefen.
