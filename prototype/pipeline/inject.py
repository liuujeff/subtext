# Builds meetle.html by inserting data.js into template.html
t=open('../template.html').read(); d=open('data.js').read()
open('../meetle.html','w').write(t.replace('/*DATA*/',d))
print('wrote ../meetle.html')
