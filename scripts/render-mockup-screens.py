"""Render single screens from the approved UI mockups to PNGs, for side-by-side
comparison with emulator screenshots.

Usage (from the repo root):
    python -X utf8 scripts/render-mockup-screens.py OUT_DIR [--dark] [screen ...]

Screens: home, hold, detail, del, ex, exv, nav, settings, formula (default: all).
Each PNG is 720x1520 (360x760 dp at 2x). Needs Microsoft Edge or Google Chrome.
"""
import os
import shutil
import subprocess
import sys

MOCKUP = os.path.join('docs', 'ui-mockups', 'liftinglog-screen-mockups.html')
SCREENS = {
    'home': "M.homeScreen('B')", 'hold': "M.homeScreen('B', true)", 'detail': 'M.detailScreen()',
    'del': 'M.deleteModal()', 'ex': 'M.exercisesScreen(false)', 'exv': 'M.exercisesScreen(true)',
    'nav': "M.navCrop('dock')", 'settings': 'M.settingsScreen()', 'formula': 'M.formulaSheet()',
}
BROWSERS = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'msedge', 'google-chrome', 'chromium',
]

HARNESS = """
<script>
(function () {
  var q = new URLSearchParams(location.search);
  M.state.mode = q.get('m') || 'light';
  var html = ({SCREENS})[q.get('s')]();
  document.documentElement.style.setProperty('--z', '1');
  document.body.style.padding = '0'; document.body.style.margin = '0';
  document.body.innerHTML = '<div style="width:360px">' + M.phone(html)
    .replace('class="phone"', 'class="phone" style="padding:0;border-radius:0;box-shadow:none"')
    .replace('class="phone-inner"', 'class="phone-inner" style="border-radius:0"') + '</div>';
})();
</script>"""


def browser():
    for candidate in BROWSERS:
        found = candidate if os.path.isfile(candidate) else shutil.which(candidate)
        if found:
            return found
    sys.exit('No Edge or Chrome found.')


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    out = os.path.abspath(args[0])
    dark = '--dark' in args
    names = [a for a in args[1:] if a != '--dark'] or list(SCREENS)
    os.makedirs(out, exist_ok=True)

    source = open(MOCKUP, encoding='utf8').read()
    hook = '  render();\n})();'
    exports = ('  window.M = { homeScreen: homeScreen, detailScreen: detailScreen, exercisesScreen: exercisesScreen, '
               'settingsScreen: settingsScreen, formulaSheet: formulaSheet, deleteModal: deleteModal, navCrop: navCrop, '
               'phone: phone, state: state };\n')
    if hook not in source:
        sys.exit('Mockup script changed; update the window.M export hook in this script.')
    table = ', '.join("%s: function () { return %s; }" % (k, v) for k, v in SCREENS.items())
    page = source.replace(hook, exports + hook) + HARNESS.replace('{SCREENS}', '{' + table + '}')
    harness = os.path.join(out, 'mockup-harness.html')
    open(harness, 'w', encoding='utf8').write(page)

    exe = browser()
    url = 'file:///' + harness.replace(os.sep, '/')
    for name in names:
        if name not in SCREENS:
            sys.exit('Unknown screen %s. Choose from: %s' % (name, ', '.join(SCREENS)))
        png = os.path.join(out, '%s%s.png' % (name, '-dark' if dark else ''))
        # A separate profile per shot avoids headless instances colliding.
        profile = os.path.join(out, '.profile-' + name + ('-dark' if dark else ''))
        subprocess.run([exe, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
                        '--user-data-dir=' + profile, '--force-device-scale-factor=2', '--window-size=360,760',
                        '--screenshot=' + png, '%s?s=%s&m=%s' % (url, name, 'dark' if dark else 'light')],
                       check=True, capture_output=True, timeout=90)
        print(png)


if __name__ == '__main__':
    main()
