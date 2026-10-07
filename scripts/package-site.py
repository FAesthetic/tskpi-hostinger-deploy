#!/usr/bin/env python3
"""Preserve the exact deployed static site, applying only reviewed existing assets.
Usage: package-site.py original-site.tar.gz output-site.tar.gz
No booking data, credentials, or runtime state are packaged.
"""
import gzip,hashlib,io,pathlib,sys,tarfile
root=pathlib.Path(__file__).resolve().parent.parent
source=pathlib.Path(sys.argv[1]);target=pathlib.Path(sys.argv[2])
assert hashlib.sha256(source.read_bytes()).hexdigest()=='d76a975c523b7b14e4077746489ce5cd1ab65d41297bd7d8385ec5acd5029857','Unexpected deployed artifact'
replacements={f'release/public/{name}':(root/'public'/name).read_bytes() for name in ['immersive.js','immersive.css','admin.js']}
seen=set();target.parent.mkdir(parents=True,exist_ok=True)
with tarfile.open(source,'r:gz') as original,target.open('wb') as output,gzip.GzipFile(fileobj=output,mode='wb',mtime=0,filename='') as compressed,tarfile.open(fileobj=compressed,mode='w') as archive:
 for member in original.getmembers():
  path=pathlib.PurePosixPath(member.name)
  assert not path.is_absolute() and '..' not in path.parts and (member.isfile() or member.isdir()),'Unsafe archive member'
  assert not any(word in member.name.lower() for word in ['.env','master.key','sqlite','credential']),'Runtime content in static artifact'
  content=original.extractfile(member).read() if member.isfile() else None
  if member.name in replacements:content=replacements[member.name];seen.add(member.name)
  if member.name=='release/public/index.html':
   assert b'/immersive.css?v=day1' in content and b'/immersive.js?v=one1' in content
   content=content.replace(b'/immersive.css?v=day1',b'/immersive.css?v=mobile-scroll-20261007').replace(b'/immersive.js?v=one1',b'/immersive.js?v=mobile-scroll-20261007')
  if member.name=='release/public/verwaltung/index.html':
   assert b'/admin.js?v=one1' in content
   content=content.replace(b'/admin.js?v=one1',b'/admin.js?v=request-amount-20261007')
  member.mtime=0;member.uid=0;member.gid=0;member.uname='';member.gname=''
  if content is not None:member.size=len(content)
  archive.addfile(member,io.BytesIO(content) if content is not None else None)
assert seen==set(replacements),'Missing existing assets'
print(hashlib.sha256(target.read_bytes()).hexdigest(),target.stat().st_size)
