import numpy as np,sys
V=np.load('V3.npy');W=open('words3.txt').read().split('\n');idx={w:i for i,w in enumerate(W)}
N=12000;Vc=V[:N]
rng=np.random.default_rng(0);S=V[rng.choice(N,3000,replace=False)]
hub=(V@S.T).mean(1);np.save('hub3.npy',hub)
LAM=1.0
def obj(a,b):
    ia,ib=idx[a],idx[b];s=np.minimum(Vc@V[ia],Vc@V[ib])-LAM*hub[:N]
    for j in range(N):
        if a[:4]==W[j][:4] or b[:4]==W[j][:4] or W[j] in a or W[j] in b: s[j]=-9
    return s
P=sys.argv[1]
for pr in P.split(';'):
    a,b=pr.split()
    if a not in idx or b not in idx: print('MISSING',pr);continue
    s=obj(a,b);t=np.argsort(-s)[:6];c=V[idx[a]]@V[idx[b]]
    print(f"{a}+{b} c={c:.2f} best={s[t[0]]:.2f}",[W[j] for j in t])
