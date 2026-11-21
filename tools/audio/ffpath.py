# Where ffmpeg is: $FFMPEG, else imageio-ffmpeg's copy, else whatever is on the PATH.
import os, shutil

def _find():
    if os.environ.get('FFMPEG'):
        return os.environ['FFMPEG']
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass
    exe = shutil.which('ffmpeg')
    if not exe:
        raise SystemExit('ffmpeg not found: set FFMPEG or pip install imageio-ffmpeg')
    return exe

FF = _find()
