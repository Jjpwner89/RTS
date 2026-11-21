# Swaps models from a partial bake into models.glb: every model in <from.glb> whose name starts with <prefix>
# replaces the one of that name in <models.glb>, or is added after the others. Every other model is copied as it
# was, byte for byte. Usage: python3 swap.py ../../assets/models.glb /tmp/out/part.glb unit.folk.
import json, struct, sys

def load(path):
    d = open(path, 'rb').read()
    n = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + n]), d[20 + n + 8:]

dst, src, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
A, a_bin = load(dst)
B, b_bin = load(src)
for j in (A, B):
    assert len(j['buffers']) == 1 and len(j['materials']) == 1 and len(j['scenes']) == 1, 'expected one buffer, material and scene'

out = {k: v for k, v in A.items() if k not in ('nodes', 'meshes', 'accessors', 'bufferViews', 'buffers', 'scenes')}
out.update(nodes=[], meshes=[], accessors=[], bufferViews=[])
data = bytearray()

def copy_node(j, bin_, node):
    # a node with one mesh, each attribute and the indices in a buffer view of their own
    mesh = json.loads(json.dumps(j['meshes'][node['mesh']]))
    for prim in mesh['primitives']:
        prim['material'] = 0
        refs = prim['attributes']
        for key in list(refs) + ['indices']:
            acc = dict(j['accessors'][refs[key] if key != 'indices' else prim['indices']])
            view = dict(j['bufferViews'][acc['bufferView']])
            data.extend(b'\0' * (-len(data) % 4))
            chunk = bin_[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
            view.update(buffer=0, byteOffset=len(data))
            data.extend(chunk)
            acc['bufferView'] = len(out['bufferViews'])
            out['bufferViews'].append(view)
            if key == 'indices': prim['indices'] = len(out['accessors'])
            else: refs[key] = len(out['accessors'])
            out['accessors'].append(acc)
    n = dict(node, mesh=len(out['meshes']))
    out['meshes'].append(mesh)
    out['nodes'].append(n)

new = {n['name']: n for n in B['nodes'] if n['name'].startswith(prefix)}
assert new, f'no models named {prefix}* in {src}'
replaced = []
for node in A['nodes']:
    if node['name'] in new:
        copy_node(B, b_bin, new.pop(node['name'])); replaced.append(node['name'])
    else:
        copy_node(A, a_bin, node)
added = list(new)
for name in added: copy_node(B, b_bin, new[name])
data.extend(b'\0' * (-len(data) % 4))
out['buffers'] = [{'byteLength': len(data)}]
out['scenes'] = [dict(A['scenes'][0], nodes=list(range(len(out['nodes']))))]

js = json.dumps(out, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
body = struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(data), b'BIN\0') + bytes(data)
open(dst, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + len(body)) + body)
print('replaced', replaced, 'added', added)
