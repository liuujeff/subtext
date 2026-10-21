import gzip, numpy as np, re
from nltk.corpus import wordnet as wn, stopwords
sw=set(stopwords.words('english'))|{'also','would','could','said','one','two','three','four','five','six','seven','eight','nine','ten','may','might','must','shall'}
lemmas=set(l for l in wn.all_lemma_names() if l.isalpha())
def proper_only(w):
    ss=wn.synsets(w)
    if not ss: return True
    for s in ss:
        for l in s.lemmas():
            if l.name().lower()==w and l.name()==w: return False
    return True
raw={}
order=[]
with gzip.open('glove.gz','rt') as f:
    f.readline()
    for i,line in enumerate(f):
        if i>=120000: break
        w,rest=line.split(' ',1)
        if not re.fullmatch(r'[a-z]{3,14}',w) or w in sw or w not in lemmas: continue
        raw[w]=rest;order.append(w)
S=set(order)
words=[]
for w in order:
    if proper_only(w): continue
    if w.endswith('s') and (w[:-1] in S or (w.endswith('es') and w[:-2] in S) or (w.endswith('ies') and w[:-3]+'y' in S)): continue
    if w.endswith('ed') and (w[:-2] in S or w[:-1] in S or (len(w)>4 and w[-3]==w[-4] and w[:-3] in S)): continue
    if w.endswith('ing') and (w[:-3] in S or w[:-3]+'e' in S or (len(w)>5 and w[-4]==w[-5] and w[:-4] in S)): continue
    words.append(w)
    if len(words)>=25000: break
V=np.array([np.fromstring(raw[w],sep=' ',dtype=np.float32) for w in words])
V/=np.linalg.norm(V,axis=1,keepdims=True)
np.save('V3.npy',V);open('words3.txt','w').write('\n'.join(words))
print(len(words),words[:50]);print(words[11990:12010]);print(words[-10:])
