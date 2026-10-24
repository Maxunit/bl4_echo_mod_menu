"""Registered SDK keybinds are authoritative; display options are one-way copies.

No JSON edits and no manual callback/enable calls: assigning KeybindType.key
invokes the game's SDK rebind implementation. Used only on the game thread.
"""
import re


def valid_key(value):
    """UE key identifiers, not localized captions or browser event.key values.

    This checks transport syntax, not membership of Unreal's platform key map.
    None is the SDK's representation of an unbound key.
    """
    return value is None or (type(value) is str and
        re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,127}', value) is not None and
        value not in ('None', 'Invalid', 'AnyKey'))


class LiveKeybind:
    def __init__(self, mod, binding):
        self.mod, self.binding = mod, binding
        self.identifier = binding.identifier

    @property
    def value(self):
        return self.binding.key

    @value.setter
    def value(self, value):
        if not valid_key(value):
            raise ValueError('Invalid Unreal key identifier')
        self.binding.key = value

    def validate(self):
        bindings = list(getattr(self.mod, 'keybinds', ()) or ())
        if (sum(b is self.binding for b in bindings) != 1 or
            sum(getattr(b, 'identifier', None) == self.identifier for b in bindings) != 1 or
            self.binding.identifier != self.identifier):
            raise RuntimeError('Keybind removed, replaced or ambiguous: ' + self.identifier)
        if (getattr(self.binding, 'is_hidden', False) or
            getattr(self.binding, 'is_rebindable', False) is not True or
            not callable(getattr(self.binding, '_rebind', None))):
            raise RuntimeError('Keybind is hidden or locked: ' + self.identifier)
        if not valid_key(self.value):
            raise RuntimeError('Keybind has an unsupported current value: ' + self.identifier)
