import os
import re

DIR = 'frontend/src'

replacements = {
    # Replace the gigantic hardcoded shadow with the new CSS variable card-shadow
    r'shadow-\[rgba\(0,0,0,0\.08\)_0px_0px_0px_1px,rgba\(0,0,0,0\.04\)_0px_2px_2px,#fafafa_0px_0px_0px_1px\]': 'card-shadow',
    # Replace background whites
    r'\bbg-white\b': 'bg-background',
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
