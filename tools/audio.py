import numpy as np, wave
SR=48000; DUR=28.5; N=int(SR*DUR)
rng=np.random.default_rng(1)
out=np.zeros(N)
bpm=124; beat=60/bpm
def add(sig,t,g=1.0):
    i=int(t*SR); j=min(N,i+len(sig))
    if i<N: out[i:j]+=sig[:j-i]*g
tt=lambda d: np.arange(int(SR*d))/SR
def kick():
    t=tt(0.4); f=50+120*np.exp(-t*30); return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*7)
def clap():
    t=tt(0.2); return rng.standard_normal(len(t))*np.exp(-t*22)*0.5
def hat():
    t=tt(0.05); n=rng.standard_normal(len(t)); n=np.diff(n,prepend=0); return n*np.exp(-t*80)*0.25
bassline=[41.2,41.2,49.0,36.7]
start=0.0
b=0
while start+b*beat<DUR-0.6:
    t=start+b*beat
    add(kick(),t,0.9)
    if b%2==1: add(clap(),t,0.6)
    add(hat(),t+beat/2,0.8)
    root=bassline[(b//4)%4]
    d=tt(beat*0.9); add(np.sin(2*np.pi*root*2*d)*np.exp(-d*3)*0.35,t+0.0)
    b+=1
# pad
t=np.arange(N)/SR
chords=[[220,277.2,329.6],[196,246.9,293.7],[174.6,220,261.6],[164.8,207.7,246.9]]
pad=np.zeros(N)
bar=beat*4
for k in range(int(DUR/bar)+1):
    i=int(k*bar*SR); j=min(N,int((k+1)*bar*SR))
    seg=t[i:j]
    for f in chords[k%4]: pad[i:j]+=np.sin(2*np.pi*f*seg)+0.3*np.sin(2*np.pi*f*2.003*seg)
out+=pad*0.03
# whooshes before cuts, booms on logo
for c in [3.85,6.8,10.15,14.0,18.15,21.05,25.05]:
    d=tt(0.5); n=rng.standard_normal(len(d)); env=np.sin(np.pi*d/0.5)**2
    # simple lowpass sweep via cumulative smoothing
    n=np.convolve(n,np.ones(8)/8,'same')
    add(n*env*0.5,c-0.45)
for c in [6.9,25.1]:
    d=tt(1.2); add(np.sin(2*np.pi*(40+60*np.exp(-d*8))*d)*np.exp(-d*3)*0.9,c)
# fade out
fo=int(1.2*SR); out[-fo:]*=np.linspace(1,0,fo)
out/=np.max(np.abs(out))+1e-9; out*=0.9
st=np.stack([out,out],1)
with wave.open('music.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st*32767).astype(np.int16).tobytes())
