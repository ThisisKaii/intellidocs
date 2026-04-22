import os
import re

DIR = 'frontend/src'

replacements = {
    # Text
    r'text-\[#171717\]': 'text-foreground',
    r'text-\[#666666\]': 'text-muted-foreground',
    r'text-\[#808080\]': 'text-muted-foreground/80',
    # Backgrounds
    r'bg-\[#f6f3ed\]': 'bg-secondary',
    r'bg-\[#171717\]': 'bg-primary',
    r'bg-\[#ebe9e3\]': 'bg-secondary/80',
    r'bg-\[#2d2d2d\]': 'bg-primary/90',
    # Borders
    r'border-\[#ebebeb\]': 'border-border',
    r'border-\[#ff5b4f\]/30': 'border-destructive/30',
    # Special shadows
    r'shadow-\[0px_0px_0px_1px_rgba\(0,0,0,0\.08\)\]': 'border-shadow',
    r'shadow-\[0px_0px_0px_1px_rgba\(0,0,0,0\.08\),2px_0_0_0_hsla\(212,100%,48%,1\)\]': 'border-shadow ring-2 ring-ring',
}

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    orig = content
    for pattern, repl in replacements.items():
        content = re.sub(pattern, repl, content)
        
    if orig != content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")

for root, _, files in os.walk(DIR):
    for name in files:
        if name.endswith('.tsx') or name.endswith('.ts'):
            process_file(os.path.join(root, name))
