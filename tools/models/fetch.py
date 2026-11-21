# Downloads the CC0 Quaternius source models the bake needs into <gallery>/assets, then run pack.py on it.
# Sources are GitHub mirrors of the free packs; the packs themselves are at quaternius.com.
import json, os, re, sys, urllib.parse, urllib.request
assets = os.path.join(sys.argv[1], 'assets')
get = lambda url: urllib.request.urlopen(url).read()
def save(url, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not os.path.exists(dst): open(dst, 'wb').write(get(url))

# Knight (helmets, shoulder pads), horse and medieval weapons, 2018 packs (FBX)
B = 'beep2bleep/FreeAssetsByKenneyNLandQuaternius'
tree = json.loads(get(f'https://api.github.com/repos/{B}/git/trees/master?recursive=1'))['tree']
WEAPONS = 'Spear Shield_Round Shield_Round_2 Shield_Heater Shield_Heater_2 Bow_Wooden Bow_Wooden2 Sword Sword_2 Axe Arrow Hammer_Small'.split()
for x in tree:
    p = x['path']
    url = f'https://raw.githubusercontent.com/{B}/master/' + urllib.parse.quote(p)
    name = p.rsplit('/', 1)[-1]
    if re.search(r'Knight Character Animated.*/FBX/[^/]+\.fbx$', p) or re.search(r'Farm Animals.*/FBX/Horse\.fbx$', p):
        save(url, os.path.join(assets, 'q18', name))
    elif re.search(r'Medieval Weapons Pack.*/FBX/[^/]+\.fbx$', p) and name[:-4] in WEAPONS:
        save(url, os.path.join(assets, 'q18', 'W_' + name))

# Modular men and women (Ultimate Modular Characters), GLB
D = 'https://raw.githubusercontent.com/LuanDucate/Ducz.CharacterCreator/main/public/models'
for f in ['Male/Adventurer', 'Male/Farmer', 'Male/King', 'Female/Medieval']:
    save(f'{D}/{f}.glb', os.path.join(assets, 'qmod', f.replace('/', '_') + '.glb'))

# Ultimate Fantasy RTS, glTF
R = '313imverymellodet/realm-builder'
for x in json.loads(get(f'https://api.github.com/repos/{R}/git/trees/main?recursive=1'))['tree']:
    if x['path'].startswith('public/models/') and x['path'].endswith('.gltf'):
        save(f'https://raw.githubusercontent.com/{R}/main/' + x['path'], os.path.join(assets, 'qrts', x['path'].rsplit('/', 1)[-1]))

# Medieval Village Pack (houses, workshops and props), GLB
V = 'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/medieval_village_pack'
for n in ['House_1', 'House_2', 'House_4', 'Sawmill', 'Blacksmith', 'Mill', 'Stable', 'Cauldron', 'Barrel', 'Bags', 'Hay', 'Cart', 'Well', 'Crate']:
    save(f'{V}/{n}.glb', os.path.join(assets, 'qmvp', n + '.glb'))
# Kenney Castle Kit siege engines (CC0, kenney.nl), kept in this folder
import shutil
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kenney')
shutil.copytree(here, os.path.join(assets, 'kenney'), dirs_exist_ok=True)
# Holding stances for the soldiers, made in this repo (assets/art/3d/wip/stance-motions.mjs)
os.makedirs(os.path.join(assets, 'stances'), exist_ok=True)
shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'art', '3d', 'clips-stances.glb'), os.path.join(assets, 'stances', 'clips-stances.glb'))
# The soldiers' and horses' animation clips (lineup/skin.js samples them into assets/anim.bin), made in this repo too
art = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'art', '3d')
os.makedirs(os.path.join(assets, 'clips'), exist_ok=True)
for f in ['clips-foot.glb', 'clips-riders.glb', 'clips-horse.glb', 'wip/clip-manifest.json']:
    shutil.copy(os.path.join(art, f), os.path.join(assets, 'clips', os.path.basename(f)))
print('done')
