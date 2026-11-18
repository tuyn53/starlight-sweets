#!/usr/bin/env python3
"""纯标准库 PNG 精灵归一化：去假透明背景 + 去水印 + 裁切 + 缩放到目标尺寸 + 真 alpha。
用法: python3 make_sprite.py input.png output.png [size] [--watermark]
不依赖 Pillow。背景判定用「近白且低饱和」+ 从四边 flood-fill，避免误杀角色内部高光。
"""
import struct, zlib, sys, collections

def read_png(path):
    d=open(path,'rb').read()
    assert d[:8]==b'\x89PNG\r\n\x1a\n', 'not png'
    pos=8; idat=b''; w=h=bd=ct=None
    while pos<len(d):
        ln=struct.unpack('>I',d[pos:pos+4])[0]; typ=d[pos+4:pos+8]; data=d[pos+8:pos+8+ln]
        if typ==b'IHDR':
            w,h,bd,ct,cm,fl,il=struct.unpack('>IIBBBBB',data)
            assert bd==8 and ct in (2,6) and il==0, f'unsupported {bd}/{ct}/{il}'
        elif typ==b'IDAT': idat+=data
        elif typ==b'IEND': break
        pos+=12+ln
    raw=zlib.decompress(idat)
    bpp=3 if ct==2 else 4
    stride=w*bpp
    rows=[]; prev=bytearray(stride); i=0
    for y in range(h):
        f=raw[i]; i+=1
        line=bytearray(raw[i:i+stride]); i+=stride
        if f==1:
            for x in range(bpp,stride): line[x]=(line[x]+line[x-bpp])&255
        elif f==2:
            for x in range(stride): line[x]=(line[x]+prev[x])&255
        elif f==3:
            for x in range(stride):
                a=line[x-bpp] if x>=bpp else 0
                line[x]=(line[x]+((a+prev[x])>>1))&255
        elif f==4:
            for x in range(stride):
                a=line[x-bpp] if x>=bpp else 0
                c=prev[x-bpp] if x>=bpp else 0
                b=prev[x]
                p=a+b-c; pa=abs(p-a); pb=abs(p-b); pc=abs(p-c)
                pr=a if pa<=pb and pa<=pc else (b if pb<=pc else c)
                line[x]=(line[x]+pr)&255
        rows.append(line); prev=line
    return w,h,bpp,rows

def write_png(path,w,h,pixels):
    """pixels: bytearray RGBA length w*h*4"""
    raw=bytearray()
    stride=w*4
    for y in range(h):
        raw.append(0); raw.extend(pixels[y*stride:(y+1)*stride])
    def chunk(t,dat):
        return struct.pack('>I',len(dat))+t+dat+struct.pack('>I',zlib.crc32(t+dat)&0xffffffff)
    out=b'\x89PNG\r\n\x1a\n'
    out+=chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))
    out+=chunk(b'IDAT',zlib.compress(bytes(raw),9))
    out+=chunk(b'IEND',b'')
    open(path,'wb').write(out)

def is_bg(r,g,b):
    # 暖米白渐变底：R 227~248 / G 223~245 / B 219~243，低饱和。
    # 阈值放宽到 mn>208 & 色差<32；角色皮肤/金发饱和度高(色差>50)不会被误杀。
    # flood-fill 只从边缘连通扩散，角色内部亮部天然安全。
    mx=max(r,g,b); mn=min(r,g,b)
    return mn>200 and (mx-mn)<32

def normalize(src, dst, size=512, watermark=False):
    w,h,bpp,rows=read_png(src)
    # 组装 RGB + 初始 alpha
    rgb=[[(rows[y][x*bpp],rows[y][x*bpp+1],rows[y][x*bpp+2]) for x in range(w)] for y in range(h)]
    alpha=[[255]*w for _ in range(h)]
    # 水印区域：右下角强制当背景（AI生成水印）
    if watermark:
        for y in range(int(h*0.93),h):
            for x in range(int(w*0.86),w):
                r,g,b=rgb[y][x]
                rgb[y][x]=(250,250,250)
    # flood fill 从四边剥背景。种子用更宽松的 near-white（容忍压边的一个暗像素），
    # 扩散仍走严格 is_bg，避免吃掉角色。
    def seed_bg(c):
        r,g,b=c; return min(c)>190 and (max(c)-min(c))<45
    q=collections.deque()
    for x in range(w):
        for y in (0,h-1):
            if seed_bg(rgb[y][x]) and alpha[y][x]: q.append((x,y)); alpha[y][x]=0
    for y in range(h):
        for x in (0,w-1):
            if seed_bg(rgb[y][x]) and alpha[y][x]: q.append((x,y)); alpha[y][x]=0
    while q:
        x,y=q.popleft()
        for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0<=nx<w and 0<=ny<h and alpha[ny][nx] and is_bg(*rgb[ny][nx]):
                alpha[ny][nx]=0; q.append((nx,ny))
    # 反锯齿边缘：半透明过渡带（对邻接透明的实心像素做轻微羽化，减少硬齿）
    for y in range(1,h-1):
        for x in range(1,w-1):
            if alpha[y][x]==255 and (not alpha[y-1][x] or not alpha[y+1][x] or not alpha[y][x-1] or not alpha[y][x+1]):
                r,g,b=rgb[y][x]
                if is_bg(r,g,b): alpha[y][x]=128
    # 求非透明包围盒
    xs=[];ys=[]
    for y in range(h):
        for x in range(w):
            if alpha[y][x]>200: xs.append(x); ys.append(y)  # 只用实心像素求包围盒，排除羽化边缘/残留半透明
    if not xs: raise RuntimeError('no opaque pixels after bg removal')
    x0,x1=min(xs),max(xs); y0,y1=min(ys),max(ys)
    cw=x1-x0+1; ch=y1-y0+1
    # 等比缩放居中，脚底贴底边，四周留 4% 边
    box=size; inner=int(box*0.92)
    sc=min(inner/cw, inner/ch)
    nw=max(1,round(cw*sc)); nh=max(1,round(ch*sc))
    ox=(box-nw)//2; oy=box-nh-int(box*0.02)
    out=bytearray(box*box*4)
    for j in range(nh):
        sy=y0+min(ch-1,int(j/sc))
        for i in range(nw):
            sx=x0+min(cw-1,int(i/sc))
            dy=oy+j; dx=ox+i
            if 0<=dy<box and 0<=dx<box:
                k=(dy*box+dx)*4
                r,g,b=rgb[sy][sx]
                out[k]=r; out[k+1]=g; out[k+2]=b; out[k+3]=alpha[sy][sx]
    write_png(dst,box,box,out)
    print(f'{src} -> {dst}  crop=({x0},{y0},{x1},{y1}) placed {nw}x{nh} @({ox},{oy})')

if __name__=='__main__':
    args=sys.argv[1:]
    wm='--watermark' in args
    args=[a for a in args if a!='--watermark']
    size=int(args[2]) if len(args)>2 else 512
    normalize(args[0],args[1],size,wm)
