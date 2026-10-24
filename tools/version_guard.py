"""Build-time check against the SDK factory's actual default version parser."""
import ast
from pathlib import Path
import tomllib

SOURCE = Path(__file__).resolve().parent.parent/'tests'


def sdk_factory_source():
    text = (SOURCE/'fixtures/sdk_mod_factory.py.txt').read_text()
    # Syntax-only compatibility with the SDK's newer Python interpreter.
    # Leave the parser and factory behavior unchanged.
    return text.replace('def build_mod[T: Mod = Mod](', 'def build_mod(').replace(
        'except FileNotFoundError, tomllib.TOMLDecodeError:',
        'except (FileNotFoundError, tomllib.TOMLDecodeError):')


def default_version_parser():
    tree = ast.parse(sdk_factory_source())
    factory = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'build_mod')
    expression = next(value for arg, value in zip(factory.args.kwonlyargs, factory.args.kw_defaults)
                      if arg.arg == 'version_info_parser')
    assert isinstance(expression, ast.Lambda)
    return eval(compile(ast.Expression(expression), '<original SDK version parser>', 'eval'),
                {'__builtins__': {'tuple': tuple, 'int': int}})


def literal_assignment(path, name):
    for node in ast.parse(Path(path).read_text()).body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise ValueError('Version assignment missing: ' + name)


def validate_distribution_versions():
    parser=default_version_parser()
    root=SOURCE.parent
    menu=literal_assignment(root/'src/bl4_echo_mod_menu/metadata.py','VERSION')
    module=ast.parse((root/'examples/echo_menu_example/__init__.py').read_text())
    call=next(n.value for n in module.body if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='build_mod')
    example=ast.literal_eval(next(k.value for k in call.keywords if k.arg=='version'))
    return {'echo':menu,'echo_version_info':list(parser(menu)),'example':example,'example_version_info':list(parser(example))}
