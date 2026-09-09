import os, subprocess, shlex
from pathlib import Path

ROOT=Path(__file__).parent
OUT=ROOT/'docs/submission/media/final'
TMP=ROOT/'.tmp/mechanism-led-candidate'
TMP.mkdir(parents=True, exist_ok=True)
W,H=1920,1080
FPS=30
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def run(cmd):
    print('RUN', ' '.join(shlex.quote(str(x)) for x in cmd))
    subprocess.run(cmd, check=True)

VOICE=OUT/'0-infinity-voiceover-locked.mp3'
PROOF_IMAGES=['demo.png','integrate.png','try.png']
if not VOICE.exists():
    raise SystemExit(f'Missing required narration: {VOICE}')
missing=[name for name in PROOF_IMAGES if not (OUT/name).exists()]
if missing:
    raise SystemExit(f'Missing required proof images: {", ".join(missing)}')

def mech(i,d,title,subtitle,labels,accent='00FF94'):
    # Dark mechanism field: moving rail, nodes, pulses, and readable state labels.
    label_filters=[]
    ys=[430,560,690,820]
    for n,(lab,y) in enumerate(zip(labels,ys)):
        label_filters.append(f"drawbox=x='w*0.16+sin(t*1.1+{n})*w*0.025':y={y}:w=300:h=72:color=0x171A1D@1:t=fill")
        label_filters.append(f"drawbox=x='w*0.16+sin(t*1.1+{n})*w*0.025':y={y}:w=300:h=72:color=0x{accent}@0.55:t=2")
        safe=lab.replace(':','\\:')
        label_filters.append(f"drawtext=fontfile={BOLD}:text='{safe}':fontcolor=white:fontsize=25:x='w*0.16+sin(t*1.1+{n})*w*0.025+22':y={y+22}")
    filt=(
      f"drawgrid=w=160:h=120:t=1:c=0x20252A@0.34,"
      f"drawtext=fontfile={BOLD}:text='{title}':fontcolor=white:fontsize=74:x=130:y=120,"
      f"drawtext=fontfile={FONT}:text='{subtitle}':fontcolor=0xA0A0A0:fontsize=28:x=136:y=220,"
      f"drawbox=x='w*0.12+sin(t*.8)*30':y=360:w=1450:h=3:color=0x{accent}@0.42:t=fill,"
      f"drawbox=x='w*0.12+mod(t*210\\,1450)':y=350:w=72:h=22:color=0x{accent}@0.95:t=fill,"
      f"drawbox=x='w*0.28+sin(t*1.7)*120':y=335:w=20:h=20:color=0x{accent}:t=fill,"
      f"drawbox=x='w*0.54+sin(t*1.25+2)*160':y=335:w=20:h=20:color=0x{accent}:t=fill,"
      f"drawbox=x='w*0.78+sin(t*1.45+1)*130':y=335:w=20:h=20:color=0x{accent}:t=fill,"
      + ','.join(label_filters)+','
      f"drawtext=fontfile={FONT}:text='LIVE MECHANISM / 0-INFINITY':fontcolor=0x{accent}:fontsize=22:x=136:y=970"
    )
    path=TMP/f'{i:02d}.mp4'
    run(['ffmpeg','-y','-f','lavfi','-i',f'color=c=0B0D0F:s={W}x{H}:r={FPS}', '-t',str(d),'-vf',filt,'-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',str(path)])

def proof(i,d,title,img):
    path=TMP/f'{i:02d}.mp4'
    # Real UI surface, gently pushed and scanned rather than held as a dead slide.
    vf=(f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0B0D0F,"
        "zoompan=z='min(zoom+0.0007,1.045)':d=1:s=1920x1080:fps=30,"
        "drawbox=x=0:y='mod(t*240\\,1080)':w=1920:h=3:color=00FF94@0.55:t=fill,"
        f"drawtext=fontfile={BOLD}:text='{title}':fontcolor=white:fontsize=26:x=90:y=55:box=1:boxcolor=0B0D0F@0.72:boxborderw=14")
    run(['ffmpeg','-y','-loop','1','-i',str(OUT/img),'-t',str(d),'-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',str(path)])

def endcard(i,d):
    path=TMP/f'{i:02d}.mp4'
    vf=("drawgrid=w=160:h=120:t=1:c=0x20252A@0.34,"
        "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='0 → ∞':fontcolor=00FF94:fontsize=168:x=(w-text_w)/2:y=320,"
        "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='EVIDENCE BEFORE AUTHORITY':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=570,"
        "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='BOUNDED AUTHORITY / CONDITIONED EXECUTION':fontcolor=A0A0A0:fontsize=24:x=(w-text_w)/2:y=640,"
        "drawbox=x='w/2-230+sin(t*1.4)*80':y=760:w=460:h=3:color=00FF94@0.8:t=fill")
    run(['ffmpeg','-y','-f','lavfi','-i',f'color=c=0B0D0F:s={W}x{H}:r={FPS}','-t',str(d),'-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',str(path)])

mech(1,12.5,'0 AUTHORITY','An agent can observe. Nothing can act yet.', ['OBSERVE','THESIS','EVIDENCE','NO ACTION'])
mech(2,18.5,'OPPORTUNITY ENTERS','A BTC opportunity becomes a bounded decision path.', ['BTC / LONG','31 BPS','MARKET DATA','THESIS'])
mech(3,18.5,'COUNCIL ACTIVATES','Advocate, Opposer, and Market Analyst move in sequence.', ['ADVOCATE','OPPOSER','MARKET ANALYST','COUNCIL'])
mech(4,16.5,'REASONING RECEIPT','Support, dissent, uncertainty, and invalidation are recorded.', ['SUPPORT +31BPS','DISSENT LOGGED','UNCERTAINTY 08%','INVALIDATOR SET'])
mech(5,16.5,'BOUNDED AUTHORITY','Approval compiles into a short-lived Execution Mandate.', ['SYMBOL BTC','SIDE LONG','SIZE + PRICE','SPREAD / EDGE'])
mech(6,15.5,'TRIGGER → REALITY','Execution is deterministic while conditions still justify it.', ['TRIGGER ARRIVES','SPREAD','SLIPPAGE + FEES','FUNDING'])
mech(7,17,'EDGE COLLAPSED','The remaining executable edge falls below threshold.', ['EXPECTED +31BPS','COSTS -19BPS','EDGE < MINIMUM','REFUSE TRADE'],accent='FF5C6C')
proof(8,6,'REAL UI / DEMO','demo.png')
proof(9,5,'REAL UI / INTEGRATE','integrate.png')
proof(10,5,'REAL UI / TRY','try.png')
endcard(11,5.9)

concat=TMP/'concat.txt'
concat.write_text('\n'.join(f"file '{(TMP/f'{i:02d}.mp4').as_posix()}'" for i in range(1,12))+'\n')
video=OUT/'0-infinity-mechanism-led-candidate.mp4'
duration=subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(VOICE)], text=True).strip()
run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(concat),'-t',duration,'-i',str(VOICE),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',str(video)])
print(video)
