"""Read bundled data through the importer, including directly from .sdkmod ZIPs."""
from importlib.resources import files
import json


def read_json(package, name):
    return json.loads(files(package).joinpath(name).read_text(encoding='utf-8'))
