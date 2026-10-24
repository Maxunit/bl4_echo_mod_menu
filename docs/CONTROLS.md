# Controls

The game owns physical mappings. ECHO uses native navigation/Confirm/Cancel
signals and the existing gamepad-cursor primary-click route. With usual
DualSense mappings, Confirm is Cross and Cancel is Circle.

| Context | Confirm | Directions / Cancel |
| --- | --- | --- |
| Browse | Activate the focused control | D-pad moves; native Back outside an edit |
| Minus / Plus | Change one numeric step | Left/right moves between numeric controls |
| Slider / choice | Begin editing, then keep the draft | Left/right changes the value; Cancel restores the previous draft |
| Text field | Confirm a valid entry | Cancel restores the entry before editing |
| Keyboard capture | Press/release a supported keyboard key | Cancel ends capture without changing the binding |

The cyan frame marks navigation focus. Orange marks active editing. Numeric
rows have separate Minus, Slider and Plus targets; Confirm on the slider begins
the mode where left/right adjusts rather than moving to another control.
The focused option row is also marked and scrolled into view.

Focus memories are scoped to mod/category. Hidden and disabled controls are
skipped. Moving a real cursor returns to cursor operation and cancels an
unfinished slider/choice preview. Window blur, hiding or deactivation also ends
that unfinished preview without discarding earlier drafts or queued changes.

Cancel is registered only while an edit/text/capture context is active. One
Cancel ends that context, leaving older drafts intact. Outside the context the
game's normal Back behavior runs. Save & Apply still queues changes; closing the
inventory applies them.

Keyboard capture supports single supported keyboard keys, not arbitrary chords,
an on-screen keyboard or physical gamepad-button rebinding. Empty bindings are
supported. The actual SDK keybind object is authoritative.
