from playwright.sync_api import sync_playwright

WEB = 'http://localhost:5173'
EMAIL = 'test@test.com'
PASSWORD = 'asd123'
DOC_ID = '8018d3c6-3e42-4aa5-b1e7-21d92c464efc'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome")
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on('console', lambda msg: print(f'CONSOLE [{msg.type}]: {msg.text}'))
    page.on('pageerror', lambda err: print(f'PAGEERROR: {err}'))

    page.goto(f'{WEB}/login')
    page.fill('input#email', EMAIL)
    page.fill('input#password', PASSWORD)
    page.click('button[type=submit]')
    page.wait_for_url(f'{WEB}/dashboard')

    print(f'Navigating to document {DOC_ID}...')
    page.goto(f'{WEB}/document/{DOC_ID}')
    page.wait_for_selector('.rm-pages-wrapper', state='attached', timeout=40000)

    for i in range(10):
        page.wait_for_timeout(2000)
        breaks_count = page.locator(".rm-pages-wrapper > .rm-page-break").count()
        pages_count = page.locator(".rm-pages-wrapper > .rm-page-break > .page").count()
        print(f'  [T+{ (i+1)*2 }s] breaks: {breaks_count}, pages: {pages_count}')
        if breaks_count > 100:
            print('  ALERT: runaway page break explosion detected!')
            break

    browser.close()
