"""Package identity, shared by runtime diagnostics and the release builder."""
VERSION = '1.2.4'
UI_REVISION = '1.2.4'

def distribution_info():
    archive = getattr(__loader__, 'archive', None)
    return {'package':'bl4_echo_mod_menu', 'format':'sdkmod' if archive else 'folder',
            'version':VERSION, 'ui_revision':UI_REVISION}
