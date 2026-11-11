import os
from playwright.sync_api import sync_playwright

def export_poster(scale_factor=3, output_name='IntelliDocs_Exhibit_Poster_2x3ft.png'):
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
        page = browser.new_page(
            viewport={'width': 960, 'height': 1440},
            device_scale_factor=scale_factor
        )
        abs_path = os.path.abspath('docs/poster_2x3ft.html')
        page.goto('file:///' + abs_path.replace('\\', '/'))
        page.wait_for_load_state('networkidle')
        
        canvas = page.locator('.poster-canvas')
        output_path = os.path.join('docs', output_name)
        canvas.screenshot(path=output_path)
        print(f'Exported: {output_path} (scale: {scale_factor}x)')
        browser.close()

if __name__ == '__main__':
    # 3x scale factor = 2880 x 4320 px (sharp and fast)
    export_poster(scale_factor=3, output_name='IntelliDocs_Exhibit_Poster_2x3ft.png')
    # 5x scale factor = 4800 x 7200 px (ultra-high-res 200 DPI for large format print)
    export_poster(scale_factor=5, output_name='IntelliDocs_Exhibit_Poster_2x3ft_Print_300DPI.png')
