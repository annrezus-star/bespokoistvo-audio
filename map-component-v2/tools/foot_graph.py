import json,math,heapq,collections,pathlib,sys
osm=json.load(open(sys.argv[1]));resp=json.load(open(sys.argv[2]))
ways=[w for w in osm['elements']if w['type']=='way'];barriers={n['id']:n for n in osm['elements']if n['type']=='node'}
coords={};adj=collections.defaultdict(dict);edgeinfo={};segments=[]
allowed={'footway','pedestrian','steps','path','living_street','service','unclassified','residential','tertiary','secondary','primary','track'}
blocked={'no','private','customers','delivery','agricultural','forestry','use_sidepath','destination'}
footyes={'yes','designated','permissive'}
def dist(a,b):return math.hypot((a[0]-b[0])*62600,(a[1]-b[1])*111200)
def denied(t):return (t.get('foot')or t.get('access'))in blocked
badnodes={n for n,v in barriers.items()if denied(v.get('tags',{})) or(v.get('tags',{}).get('barrier')in['wall','fence']and v.get('tags',{}).get('foot')not in footyes)}
for w in ways:
 t=w['tags'];h=t.get('highway');g=w.get('geometry',[]);ns=w.get('nodes',[])
 if denied(t)or(h not in allowed and t.get('foot')not in footyes)or len(g)!=len(ns):continue
 for n,p in zip(ns,g):coords[n]=[p['lon'],p['lat']]
 for a,b in zip(ns,ns[1:]):
  if a in badnodes or b in badnodes:continue
  one=t.get('oneway:foot');forward=t.get('foot:forward')!='no'and one!='-1';backward=t.get('foot:backward')!='no'and one not in['yes','1']
  d=dist(coords[a],coords[b]);segments.append((a,b,w['id'],forward,backward))
  if forward:adj[a][b]=d;edgeinfo[(a,b)]=w['id']
  if backward:adj[b][a]=d;edgeinfo[(b,a)]=w['id']
def project(a,b,p):
 ax,ay=(a[0]-p[0])*62600,(a[1]-p[1])*111200;bx,by=(b[0]-p[0])*62600,(b[1]-p[1])*111200;dx,dy=bx-ax,by-ay;t=max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy)))if dx*dx+dy*dy else 0
 return math.hypot(ax+t*dx,ay+t*dy),t,[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
groups=collections.defaultdict(list)
for i,w in enumerate(resp['waypoints']):
 candidates=[(*project(coords[a],coords[b],w['location']),a,b,wid,fw,bw)for a,b,wid,fw,bw in segments]
 d,t,p,a,b,wid,fw,bw=min(candidates,key=lambda c:c[0]);n=-i-1;coords[n]=p;groups[(a,b,wid,fw,bw)].append((t,n));print('snap',i+1,round(d,2),'way',wid)
for(a,b,wid,fw,bw),points in groups.items():
 adj[a].pop(b,None);adj[b].pop(a,None);chain=[a]+[n for _,n in sorted(points)]+[b]
 for x,y in zip(chain,chain[1:]):
  d=dist(coords[x],coords[y])
  if fw:adj[x][y]=d;edgeinfo[(x,y)]=wid
  if bw:adj[y][x]=d;edgeinfo[(y,x)]=wid
out=[]
for i in range(7):
 start,end=-i-1,-i-2;q=[(0,start)];best={start:0};prev={}
 while q:
  d,n=heapq.heappop(q)
  if d!=best[n]:continue
  if n==end:break
  for nxt,w in adj[n].items():
   v=d+w
   if v<best.get(nxt,float('inf')):best[nxt]=v;prev[nxt]=n;heapq.heappush(q,(v,nxt))
 if end not in best:raise RuntimeError('Disconnected foot path '+str(i+1))
 path=[end]
 while path[-1]!=start:path.append(prev[path[-1]])
 path.reverse();wids=[edgeinfo[(a,b)]for a,b in zip(path,path[1:])]
 print('foot only leg',i+1,'metres',round(best[end]),'vertices',len(path),'ways',list(dict.fromkeys(wids)))
 out.append({'order':i+1,'coordinates':[coords[n]for n in path],'nodes':path,'wayIds':list(dict.fromkeys(wids))})
pathlib.Path(sys.argv[3]).write_text(json.dumps(out,ensure_ascii=False,indent=2))
