# Simple WCAG contrast checker for key color pairs
# Run with: python tools/contrast_check.py

import math

# convert hex to relative luminance
def hex_to_rgb(hexc):
    h = hexc.lstrip('#')
    return tuple(int(h[i:i+2],16)/255.0 for i in (0,2,4))

def srgb_chan(c):
    if c <= 0.03928:
        return c/12.92
    return ((c+0.055)/1.055) ** 2.4

def luminance(hexc):
    r,g,b = hex_to_rgb(hexc)
    R = srgb_chan(r)
    G = srgb_chan(g)
    B = srgb_chan(b)
    return 0.2126*R + 0.7152*G + 0.0722*B

def contrast_ratio(a,b):
    La = luminance(a)
    Lb = luminance(b)
    L1 = max(La,Lb)
    L2 = min(La,Lb)
    return (L1+0.05)/(L2+0.05)

pairs = [
    ("Light background", "#f8f9fa", "Text", "#111827"),
    ("Light background", "#f8f9fa", "Link/Accent", "#5b2be6"),
    ("Light surface", "#ffffff", "Button text", "#ffffff"),
    ("Light button", "#5b2be6", "Button text", "#ffffff"),
    ("Dark background", "#071023", "Text", "#e6eef6"),
    ("Dark surface", "#0f1724", "Accent", "#ff00a8"),
    ("Dark background", "#071023", "Accent (link)", "#ff00a8"),
]

print("WCAG contrast report (AA normal >=4.5, AA large >=3.0):\n")
for desc, bg, label, fg in pairs:
    try:
        cr = contrast_ratio(bg, fg)
        ok_normal = cr >= 4.5
        ok_large = cr >= 3.0
        print(f"{label} on {desc}: {fg} on {bg} -> contrast={cr:.2f} | AA normal: {'PASS' if ok_normal else 'FAIL'} | AA large: {'PASS' if ok_large else 'FAIL'})")
    except Exception as e:
        print('Error computing', desc, bg, label, fg, e)

# End
