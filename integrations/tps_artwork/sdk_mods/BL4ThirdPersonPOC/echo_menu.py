"""Mod-owned ECHO Menu API v1 integration; TPS also works without ECHO.

Standard visible options are referenced directly. Hidden feature options and
motion parameters use this mod's guarded callbacks. No manager import, runtime
hook, timer, additional gameplay patch or second settings store is introduced.
"""
from __future__ import annotations
from functools import partial
import inspect
import math
import sys
from . import motion_settings

SETTERS = {
    'vehicle_camera_relative_drive': '_set_vehicle_control',
    'omni_movement_experimental': '_set_omni_movement',
    'omni_movement_diagnostics': '_set_omni_diagnostics',
    'omni_hybrid_ads': '_set_omni_hybrid_ads', 'verbose_logging': '_set_verbose_logging',
    'sniper_tps_ads': '_set_sniper_mode', 'tps_ffyl_beta': '_set_ffyl_mode',
    'tps_ground_slam_beta': '_set_ground_slam_mode',
    'root_height_enabled': '_set_root_height_enabled',
    'gow_camera_enabled': '_set_dynamic_motion_enabled',
}
CATEGORIES = [('camera', 'CAMERA', 'KAMERA'), ('ads', 'ADS ZOOM', 'ADS-ZOOM'),
              ('motion', 'MOTION', 'BEWEGUNG'), ('vehicle', 'VEHICLE', 'FAHRZEUG'),
              ('omni', 'OMNI', 'OMNI'), ('diagnostics', 'DIAGNOSTICS', 'DIAGNOSE')]
GERMAN = {
    'camera_offset_x': 'Kamera-Versatz X', 'camera_offset_y': 'Kamera-Versatz Y',
    'camera_offset_z': 'Kamera-Versatz Z', 'shoulder_swap_duration': 'Dauer des Schulterwechsels',
    'tps_ffyl_beta': 'Third Person im Überlebenskampf (Beta)',
    'tps_ground_slam_beta': 'Third Person beim Ground Slam (Beta)',
    'ground_slam_distance_cm': 'Zusätzlicher Kameraabstand beim Ground Slam',
    'root_height_enabled': 'Körperhöhe am Boden berücksichtigen',
    'tps_ads_zoom_global': 'Globaler TPS-Zoom beim Zielen',
    'sniper_tps_ads': 'Scharfschützengewehre in Third Person zielen',
    'gow_camera_enabled': 'Dynamische Kamerabewegung',
    'vehicle_offset_x': 'Fahrzeugkamera-Versatz X', 'vehicle_offset_y': 'Fahrzeugkamera-Versatz Y',
    'vehicle_offset_z': 'Fahrzeugkamera-Versatz Z',
    'vehicle_camera_relative_drive': 'Fahrzeug relativ zur Kamera steuern',
    'omni_movement_experimental': 'Omnidirektionale Bewegung (experimentell)',
    'omni_hybrid_ads': 'Hybrides Zielen (Omni)', 'verbose_logging': 'Ausführliche Protokollierung',
    'omni_movement_diagnostics': 'Diagnose der omnidirektionalen Bewegung',
    'motion.still_gain': 'Stärke im Stand (%)', 'motion.walk_gain': 'Stärke beim Gehen (%)',
    'motion.fast_gain': 'Stärke bei schneller Bewegung (%)', 'motion.air_gain': 'Stärke in der Luft (%)',
    'motion.landing_gain': 'Stärke beim Landen (%)', 'motion.crouch_gain': 'Übergang beim Ducken (%)',
    'motion.filter': 'Reaktionsstärke (%)', 'motion.baseline': 'Anpassung an die Pose (%)',
    'motion.idle_horizontal': 'Horizontale Bewegung im Stand (%)',
    'motion.axis_x': 'Vorwärts / rückwärts (%)', 'motion.axis_y': 'Seitwärts (%)',
    'motion.axis_z': 'Vertikal (%)', 'motion.limit_x': 'Grenze vorwärts / rückwärts',
    'motion.limit_y': 'Seitliche Grenze', 'motion.limit_z': 'Vertikale Grenze',
    'motion.walk_speed': 'Geschwindigkeitsschwelle fürs Gehen',
    'motion.fast_speed': 'Schwelle für schnelle Bewegung',
    'motion.unknown_gain': 'Stärke bei unbekannter Geschwindigkeit (%)',
}
GROUPS_DE = {'MOVEMENT': 'FORTBEWEGUNG', 'ACTIONS': 'AKTIONEN', 'RESPONSE': 'REAKTION',
             'AXIS STRENGTH': 'ACHSENSTÄRKE', 'MOVEMENT LIMITS': 'BEWEGUNGSGRENZEN',
             'SPEED DETECTION': 'GESCHWINDIGKEITSERKENNUNG'}
WEAPONS_DE = {'pistol': 'Pistole', 'smg': 'Maschinenpistole', 'assault_rifle': 'Sturmgewehr',
              'shotgun': 'Schrotflinte', 'sniper_rifle': 'Scharfschützengewehr', 'heavy_weapon': 'Schwere Waffe'}
DESCRIPTIONS_DE = {
    'camera_offset_x': 'Versatz der Kamera nach vorne und hinten.',
    'camera_offset_y': 'Seitlicher Abstand der Kamera zur Schulter.',
    'camera_offset_z': 'Vertikaler Versatz der Kamera.',
    'shoulder_swap_duration': 'Dauer in Sekunden; 0 wechselt sofort die Schulter.',
    'ground_slam_distance_cm': 'Zusätzlicher Kameraabstand beim Ground Slam; 0 deaktiviert den Zusatzabstand.',
    'gow_camera_enabled': 'Lässt die Third-Person-Kamera den Bewegungen des Körpers folgen.',
    'verbose_logging': 'Zusätzliche Statusmeldungen. Aus: nur Probleme und ausdrücklich angeforderte Berichte.',
}


def _options(owner):
    keys = [*(f'camera_offset_{a}' for a in 'xyz'), *(f'vehicle_offset_{a}' for a in 'xyz'),
            *SETTERS, 'ground_slam_distance_cm']
    result = {key: getattr(owner, key) for key in keys if key != 'gow_camera_enabled'}
    result['gow_camera_enabled'] = owner.dynamic_motion_camera_enabled
    result['shoulder_swap_duration'] = owner._camera_feature_options['shoulder']
    result['tps_ads_zoom_global'] = owner._camera_feature_options['global']
    for category, (custom, zoom) in owner._camera_feature_options['categories'].items():
        result['tps_ads_zoom_' + category + '_custom'] = custom
        result['tps_ads_zoom_' + category] = zoom
    return result


class Settings:
    def __init__(self, owner):
        self.owner, self.mod = owner, owner.mod
        self.options = _options(owner)
        self.motion = owner._dynamic_motion_parameters
        self.motion_dirty = False
        methods = set(SETTERS.values()) | {'_dynamic_motion_reset', '_save_dynamic_motion_choice', '_get_dynamic_motion_enabled'}
        self.methods = {name: getattr(owner, name) for name in methods}
        for name, callback in self.methods.items():
            inspect.signature(callback).bind(*(() if name in ('_dynamic_motion_reset', '_get_dynamic_motion_enabled') else (False,)))
        self.bounds = {key: tuple(getattr(option, field, None) for field in ('min_value', 'max_value', 'step', 'is_integer'))
                       for key, option in self.options.items()}
        self.provider = None

    def validate(self):
        owner = self.owner
        if sys.modules.get(owner.__name__) is not owner or owner.mod is not self.mod:
            raise RuntimeError('TPS module/registration was replaced')
        if self.mod.echo_menu_provider is not self.provider:
            raise RuntimeError('TPS menu provider was replaced')
        current_options = _options(owner)
        if (owner._dynamic_motion_parameters is not self.motion or
                any(current_options.get(key) is not option for key, option in self.options.items()) or
                any(getattr(owner, name, None) is not callback for name, callback in self.methods.items())):
            raise RuntimeError('TPS settings/functions were replaced')
        if any(tuple(getattr(option, field, None) for field in ('min_value', 'max_value', 'step', 'is_integer')) != self.bounds[key]
               for key, option in self.options.items()):
            raise RuntimeError('TPS numeric bounds changed')
        for key, option in self.options.items():
            if not self.check_value(key, option.value):
                raise RuntimeError('TPS live option data is invalid: ' + key)
        if any(not self.check_value('motion.' + key, self.motion[key]) for key in motion_settings.DEFAULTS):
            raise RuntimeError('TPS live motion data is invalid')
        gate = sys.modules.get(owner.__name__ + '.build_gate')
        reviewed = getattr(gate, '_cache', {}).get('status', {}).get('reviewed') is True
        updates = sys.modules.get(owner.__name__ + '.runtime_updates')
        predicate = getattr(updates, 'is_game_thread', None)
        return (reviewed and self.mod.is_enabled is True and callable(predicate) and predicate() is True)

    def read(self, key):
        if key.startswith('motion.'):
            return self.motion[key[7:]]
        if key == 'gow_camera_enabled':
            return self.owner._get_dynamic_motion_enabled()
        return self.options[key].value

    def check_value(self, key, value):
        if key.startswith('motion.'):
            name = key[7:]
            return (type(value) in (int, float) and math.isfinite(value) and
                    motion_settings.sanitize({name: value})[name] == value)
        option = self.options[key]
        if type(option.default_value) is bool:
            return type(value) is bool
        return (type(value) in (int, float) and math.isfinite(value) and
                option.min_value <= value <= option.max_value and
                (not option.is_integer or int(value) == value))

    def write(self, key, value):
        if not self.validate() or not self.check_value(key, value):
            raise RuntimeError('TPS build/thread/value authorization refused')
        if key.startswith('motion.'):
            self.motion_dirty = True
            motion_settings.MotionOption(self.motion, key[7:]).value = value
        elif key in SETTERS:
            if self.methods[SETTERS[key]](value) is False:
                raise RuntimeError('TPS setter refused: ' + key)
        else:
            self.options[key].value = value
        if self.read(key) != value:
            raise RuntimeError('TPS did not retain the requested value: ' + key)

    def save(self):
        if self.motion_dirty:
            if not self.validate():
                raise RuntimeError('TPS motion persistence authorization refused')
            self.owner._dynamic_motion_reset()
            self.owner._save_dynamic_motion_choice(self.owner._get_dynamic_motion_enabled())
            self.motion_dirty = False
        return True

    def order(self, changes):
        def priority(key):
            if key == 'omni_movement_experimental':
                return 30 if changes[key] else 0
            return 20 if key in SETTERS else 10
        return sorted(changes, key=priority)


def create_provider(owner):
    settings = Settings(owner)
    owner.mod.echo_menu_artwork = {
        'package': owner.__name__,
        'icon': 'camera',
        'header': 'assets/BL4_TPS_LOGO_TRANSPARENT.png',
    }
    categories = [{'id': key, 'name': {'en': en, 'de': de}} for key, en, de in CATEGORIES]
    provider = {'api_version': 1, 'id': 'bl4.third-person', 'revision': 1,
                'categories': categories, 'options': [], 'settings': [],
                'validate': settings.validate, 'save': settings.save, 'order': settings.order,
                'unavailable_reason': {
                    'en': 'Additional TPS settings require an enabled TPS mod and its reviewed-build/game-thread authorization.',
                    'de': 'Zusätzliche TPS-Einstellungen benötigen die aktivierte TPS-Mod und deren Build- und Spielthread-Freigabe.'}}
    settings.provider = provider
    layout = [
        ('camera', ['camera_offset_x', 'camera_offset_y', 'camera_offset_z', 'shoulder_swap_duration',
                    'tps_ffyl_beta', 'tps_ground_slam_beta', 'ground_slam_distance_cm', 'root_height_enabled']),
        ('ads', ['tps_ads_zoom_global', *[name for key in owner._camera_feature_options['categories']
                 for name in ('tps_ads_zoom_' + key + '_custom', 'tps_ads_zoom_' + key)], 'sniper_tps_ads']),
        ('motion', ['gow_camera_enabled']),
        ('vehicle', ['vehicle_offset_x', 'vehicle_offset_y', 'vehicle_offset_z', 'vehicle_camera_relative_drive']),
        ('omni', ['omni_movement_experimental', 'omni_hybrid_ads']),
        ('diagnostics', ['verbose_logging', 'omni_movement_diagnostics']),
    ]
    for category, keys in layout:
        for key in keys:
            option = settings.options[key]
            label = option.display_name
            de = GERMAN.get(key, label)
            for weapon, german in WEAPONS_DE.items():
                if key == 'tps_ads_zoom_' + weapon + '_custom': de = german + ': eigener TPS-Zoom'
                elif key == 'tps_ads_zoom_' + weapon: de = german + ': TPS-Zoom'
            item = {'id': key, 'category': category, 'name': {'en': label, 'de': de}}
            if option.description:
                item['description'] = {'en': option.description, 'de': DESCRIPTIONS_DE[key]} if key in DESCRIPTIONS_DE else option.description
            if key.startswith(('camera_offset_', 'vehicle_offset_')) or key == 'ground_slam_distance_cm': item['unit'] = 'cm'
            elif key == 'shoulder_swap_duration': item['unit'] = 's'
            elif key.startswith('tps_ads_zoom_') and not key.endswith('_custom'): item['unit'] = 'x'
            if key == 'ground_slam_distance_cm': item['enabled_when'] = {'id': 'tps_ground_slam_beta', 'equals': True}
            if key == 'omni_hybrid_ads': item['enabled_when'] = {'id': 'omni_movement_experimental', 'equals': True}
            if key.startswith('tps_ads_zoom_') and key != 'tps_ads_zoom_global' and not key.endswith('_custom'):
                item['enabled_when'] = {'id': key + '_custom', 'equals': True}
            if not option.is_hidden:
                item['option'] = option
                provider['options'].append(item)
            else:
                item.update(kind='boolean' if type(option.default_value) is bool else 'number',
                            default=option.default_value, read=partial(settings.read, key),
                            write=partial(settings.write, key), validate=partial(settings.check_value, key))
                if item['kind'] == 'number':
                    item.update(min=option.min_value, max=option.max_value, step=option.step, integer=option.is_integer)
                provider['settings'].append(item)
    # Derive special values from TPS's own authoritative motion definitions.
    for group, specs in motion_settings.GROUPS:
        for key, label, description, default, lower, upper in specs:
            sid = 'motion.' + key
            provider['settings'].append({
                'id': sid, 'category': 'motion', 'kind': 'number',
                'name': {'en': label, 'de': GERMAN[sid]}, 'description': description,
                'group': {'en': group, 'de': GROUPS_DE[group]},
                'unit': 'uu/s' if key.endswith('_speed') else 'uu' if key.startswith('limit_') else '%',
                'default': default, 'min': lower, 'max': upper, 'step': 0.5 if key == 'baseline' else 1,
                'enabled_when': {'id': 'gow_camera_enabled', 'equals': True},
                'read': partial(settings.read, sid), 'write': partial(settings.write, sid),
                'validate': partial(settings.check_value, sid)})
    # Presets are shared with the existing TPS UI, not copied into the manager.
    from .menu_console import PRESETS as camera_presets
    from .vehicle_camera import PRESETS as vehicle_presets
    for category, presets, prefix in [(categories[0], camera_presets, 'camera'), (categories[3], vehicle_presets, 'vehicle')]:
        category['presets'] = [{'id': name, 'name': {'en': name, 'de': {
            'STANDARD': 'STANDARD', 'CLOSE': 'NAH', 'WIDE': 'WEIT', 'NEAR': 'NAH', 'FAR': 'FERN'}.get(name, name)},
            'values': {prefix + '_offset_' + axis: value for axis, value in zip('xyz', values)}}
            for name, values in presets.items()]
    return provider
