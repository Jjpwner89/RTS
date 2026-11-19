# Pack every model under assets/ into base64 GLB text files (<name>.glb.txt) that artifacts can serve.
import base64, json, os, struct, sys
root = sys.argv[1]
n = 0
for d, _, fs in os.walk(os.path.join(root, 'assets')):
    for f in fs:
        p = os.path.join(d, f)
        if f.endswith('.glb'):
            data = open(p, 'rb').read()
            out = p[:-4]
        elif f.endswith('.gltf'):
            j = json.load(open(p))
            assert len(j.get('buffers', [])) == 1, p
            b = j['buffers'][0]
            if b['uri'].startswith('data:'):
                bin_ = base64.b64decode(b['uri'].split(',', 1)[1])
            else:
                bin_ = open(os.path.join(d, b['uri']), 'rb').read()
            j['buffers'][0] = {'byteLength': len(bin_)}
            js = json.dumps(j, separators=(',', ':')).encode()
            js += b' ' * (-len(js) % 4)
            bin_ += b'\0' * (-len(bin_) % 4)
            body = struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bin_), b'BIN\0') + bin_
            data = struct.pack('<4sII', b'glTF', 2, 12 + len(body)) + body
            out = p[:-5]
        elif f.endswith('.fbx'):
            open(p + '.txt', 'w').write(base64.b64encode(open(p, 'rb').read()).decode())
            n += 1
            continue
        else:
            continue
        open(out + '.glb.txt', 'w').write(base64.b64encode(data).decode())
        n += 1
print('packed', n)
