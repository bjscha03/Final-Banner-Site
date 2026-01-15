import re
c=open("src/pages/admin/Orders.tsx").read()
lines=c.split(chr(10))
out=[]
i=0
while i < len(lines):
    line = lines[i]
    if 'const getThumbnailUrl = (item: any, maxWidth: number = 80)' in line:
        out.append('  const getThumbnailUrl = (item: any) => {')
        out.append('    return item.thumbnail_url || item.web_preview_url || item.file_url || item.print_ready_url || null;')
        out.append('  };')
        bc = 0
        ff = False
        while i < len(lines):
            if '{' in lines[i]: bc += lines[i].count('{'); ff = True
            if '}' in lines[i]: bc -= lines[i].count('}')
            i += 1
            if ff and bc <= 0: break
        continue
    out.append(line)
    i += 1
open('src/pages/admin/Orders.tsx','w').write(chr(10).join(out))
print('Done! Replaced functions.')
