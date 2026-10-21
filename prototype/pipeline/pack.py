import numpy as np, base64, json, random
V=np.load('V3.npy');W=open('words3.txt').read().split('\n');idx={w:i for i,w in enumerate(W)}
N=12000
rng=np.random.default_rng(0);S=V[rng.choice(N,3000,replace=False)]
hub=(V@S.T).mean(1).astype(np.float32)
sc=np.abs(V).max(0).astype(np.float32)
Q=np.round(V/sc*127).astype(np.int8)
D=Q.astype(np.float32)*sc/127;D/=np.linalg.norm(D,axis=1,keepdims=True)
print('quant err min cos',(D*V).sum(1).min())
pairs="drum heartbeat;armor sweater;cottage skyscraper;wire vein;whale telescope;astronaut farmer;cactus violin;owl factory;meadow factory;lighthouse sandwich;castle kitchen;poet engineer;battery apple;memory engine;church stadium;island traffic;train dream;snow coffee;sword church;shark library;ghost bicycle;volcano island;horse ocean;camel ship;ice fire;bone silk;war garden;stone feather;pirate accountant;dragon salad;circus funeral;shield blanket;truck elephant;harbor nightmare;village satellite;iron cloud;feather hammer;tiger silk;wolf moon;chef surgeon;forest mathematics;thunder applause;goat mountain;tree skyscraper;lamp sun;garden kindergarten;whale submarine;flamingo ballerina;volcano anger;nest apartment;cloud pillow;crown sun;peacock fashion;smoke ghost;leaf paper;candle star"
P=[p.split() for p in pairs.split(';')]
for a,b in P: assert a in idx and b in idx,(a,b)
random.seed(2026);random.shuffle(P)
data={'w':' '.join(W),'n':N,'d':100,'q':base64.b64encode(Q.tobytes()).decode(),'s':base64.b64encode(sc.tobytes()).decode(),'h':base64.b64encode(hub.tobytes()).decode(),'p':P}
js='window.MP_DATA='+json.dumps(data,separators=(',',':'))+';'
open('data.js','w').write(js);print(len(js)/1e6,'MB',len(P),'pairs')
