#!/usr/bin/env python3
"""纯标准库：把 RGBA PNG 缩放后贴到模拟游戏深色背景上，做游戏实际尺寸验收。
用法: python3 preview_scale.py sprite.png out.png 52 [--bg grid|plain]
"""
import sys, struct, zlib
from make_sprite import read_png, write_png

def composite(src,dst,target_h,bgmode='grid'):
    w,h,bpp,rows=read_png(src)  # bpp=4 期望 RGBA
    assert bpp==4, 'need RGBA source'
    sc=target_h/h
    nw=max(1,round(w*sc)); nh=target_h
    # 画布：角色周围留白，模拟屏幕局部
    CW=max(320,nw*4); CH=max(200,nh*4)
    canvas=bytearray(CW*CH*4)
    # 背景：深蓝紫 #0a0c18 + 网格
    for y in range(CH):
        for x in range(CW):
            k=(y*CW+x)*4
            r,g,b=(10,12,24)
            if bgmode=='grid' and (x%90==0 or y%90==0): r,g,b=(22,26,44)
            canvas[k]=r;canvas[k+1]=g;canvas[k+2]=b;canvas[k+3]=255
    ox=(CW-nw)//2; oy=(CH-nh)//2
    for j in range(nh):
        sy=min(h-1,int(j/sc))
        for i in range(nw):
            sx=min(w-1,int(i/sc))
            k=sx*4; a=rows[sy][k+3]
            if a==0: continue
            dx=ox+i; dy=oy+j
            if 0<=dx<CW and 0<=dy<CH:
                dk=(dy*CW+dx)*4
                for c in range(3):
                    canvas[dk+c]=(rows[sy][k+c]*a+canvas[dk+c]*(255-a))//255
    write_png(dst,CW,CH,canvas)
    print(f'{src} scaled {w}x{h} -> {nw}x{nh} on {CW}x{CH} {bgmode}')

if __name__=='__main__':
    a=sys.argv[1:]
    h=int(a[2]); mode=a[3].lstrip('-') if len(a)>3 else 'grid'
    composite(a[0],a[1],h,mode)
