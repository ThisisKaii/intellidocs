from playwright.sync_api import sync_playwright

WEB = 'http://localhost:5173'
EMAIL = 'test@test.com'
PASSWORD = 'asd123'
DOC_ID = '8018d3c6-3e42-4aa5-b1e7-21d92c464efc'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome")
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    page.goto(f'{WEB}/login')
    page.fill('input#email', EMAIL)
    page.fill('input#password', PASSWORD)
    page.click('button[type=submit]')
    page.wait_for_url(f'{WEB}/dashboard')

    page.goto(f'{WEB}/document/{DOC_ID}')
    page.wait_for_selector('.rm-pages-wrapper', state='attached', timeout=40000)

    children = page.evaluate("""() => {
        const editor = document.querySelector('.ProseMirror');
        return Array.from(editor.children).map(c => ({
            tag: c.tagName,
            cls: c.className,
            text: (c.innerText || '').slice(0, 30)
        }));
    }""")

    print(f"Direct children of .ProseMirror: {len(children)}")
    for i, c in enumerate(children[:20]):
        print(f"  {i}: {c['tag']}.{c['cls']} - '{c['text']}'")

    browser.close()
