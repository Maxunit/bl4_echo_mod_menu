SCRIPT_CLASS = "/Game/UI/Scripts/ui_script_menu_base.ui_script_menu_base_C"


def hook_metadata(sdk, diagnostics=None):
    """Resolve observed signatures, including inherited methods, by actual owner."""
    if diagnostics is None:
        diagnostics = {}
    diagnostics.update({'requested_class': SCRIPT_CLASS, 'ancestors': [],
        'candidates': [], 'field_types': {}, 'fields_scanned': 0})
    cls = sdk.find_class(SCRIPT_CLASS)
    if cls is None:
        raise RuntimeError('Menu script class is not loaded; open and close inventory first')
    ranks = {}
    ancestor = cls
    for depth in range(16):
        if ancestor is None:
            break
        path = str(ancestor._path_name())
        if path in ranks:
            raise RuntimeError('Cycle in menu script class hierarchy')
        if depth == 0 and path != SCRIPT_CLASS:
            raise RuntimeError('Loaded menu script class path differs')
        ranks[path] = depth
        diagnostics['ancestors'].append(path)
        ancestor = ancestor.SuperField
    if ancestor is not None:
        raise RuntimeError('Menu script ancestor limit reached')
    matches = {}
    for index, field in enumerate(cls._fields()):
        if index >= 512:
            raise RuntimeError('Menu script field limit reached')
        kind = type(field).__name__
        diagnostics['fields_scanned'] += 1
        diagnostics['field_types'][kind] = diagnostics['field_types'].get(kind, 0) + 1
        if kind != 'UFunction':
            continue
        name = str(field.Name)
        key = name.casefold()
        if key not in ('activate', 'deactivate'):
            continue
        path = str(field._path_name())
        owner = field.Outer
        owner_path = str(owner._path_name()) if owner is not None else None
        row = {'name': name, 'path': path, 'declaring_owner': owner_path,
            'ancestor_depth': ranks.get(owner_path), 'num_params': int(field.NumParams),
            'parameter_properties': {}, 'local_properties': {}, 'selected': False}
        diagnostics['candidates'].append(row)
        if owner_path not in ranks:
            row['rejected'] = 'owner_outside_menu_hierarchy'
            continue
        if not path or len(path) > 4096:
            raise RuntimeError('Invalid SDK lifecycle function path')
        props = {}
        for prop_index, prop in enumerate(field._properties()):
            if prop_index >= 32:
                raise RuntimeError('Menu script parameter limit reached')
            if int(prop.PropertyFlags) & 0x80:  # CPF_Parm; Blueprint locals are not args.
                props[str(prop.Name)] = type(prop).__name__
            else:
                row['local_properties'][str(prop.Name)] = type(prop).__name__
        row['parameter_properties'] = props
        if int(field.NumParams) != 2 or props != {
                'WorldContextObject': 'ZObjectProperty', 'OwningWidgetDef': 'ZGbxDefPtrProperty'}:
            raise RuntimeError('Menu lifecycle signature differs from the reviewed native contract: ' + name)
        previous = matches.get(key)
        if previous is not None:
            if previous['ancestor_depth'] < row['ancestor_depth']:
                continue
            if previous['ancestor_depth'] == row['ancestor_depth']:
                if previous['path'] == path:
                    continue
                raise RuntimeError('Ambiguous menu lifecycle declaration: ' + name)
            previous['selected'] = False
        row['selected'] = True
        matches[key] = row
    if set(matches) != {'activate', 'deactivate'}:
        raise RuntimeError('The two observed menu lifecycle functions are unavailable')
    return [{'path': matches[key]['path'], 'parameters': matches[key]['parameter_properties'],
        'declaring_owner': matches[key]['declaring_owner'],
        'ancestor_depth': matches[key]['ancestor_depth'],
        'mode': 'apply' if key == 'activate' else 'release'}
        for key in ('activate', 'deactivate')]
