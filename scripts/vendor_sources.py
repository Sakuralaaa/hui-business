"""Download pinned, licensed source material. No dependency installation or code execution."""
import hashlib
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPOS = {
    'nono': ('p-j-jx/Nono', ['LICENSE', 'src/lib/listing-checker.ts', 'src/lib/competitor-analysis.ts', 'src/lib/platform-export.ts']),
    'trademind': ('lien0219/trademind-ai', ['LICENSE', 'backend/internal/modules/product/ai_apply.go', 'backend/internal/providers/ai/provider.go']),
    'ecommerce-knowledge': ('kangise/ecommerce-ai-skills', ['LICENSE', 'dist/prompts.json']),
    'ecommerce-images': ('xianyu110/ecommerce-image-skills', ['LICENSE', 'README.md']),
    'amazon-reports': ('zach22-1999/amazon-skills', ['LICENSE', 'README.md']),
    'accio': ('AccioWork/agent-skills', ['LICENSE', 'README.md']),
}

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'hui-business-source-audit'})
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read()

def main():
    manifest = []
    for name, (repo, paths) in REPOS.items():
        info = json.loads(get('https://api.github.com/repos/' + repo))
        commit = json.loads(get('https://api.github.com/repos/' + repo + '/commits/' + info['default_branch']))['sha']
        if name in ('ecommerce-images', 'amazon-reports'):
            tree = json.loads(get('https://api.github.com/repos/' + repo + '/git/trees/' + commit + '?recursive=1'))
            candidates = [item['path'] for item in tree['tree'] if item['path'].endswith('SKILL.md')]
            keys = ['white-background', 'infographic'] if name == 'ecommerce-images' else ['search-term-report-analyzer', 'feature-demand-validator']
            paths += [p for p in candidates if any(k in p for k in keys)][:3]
        files = []
        for path in paths:
            content = get('https://raw.githubusercontent.com/' + repo + '/' + commit + '/' + path)
            target = ROOT / 'third_party' / name / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            files.append({'path':path,'sha256':hashlib.sha256(content).hexdigest()})
        manifest.append({'name':name,'repo':repo,'commit':commit,'license':info.get('license',{}).get('spdx_id') if info.get('license') else None,'files':files})
        print(name + ' ' + commit + ' ' + str(len(files)) + ' files')
    (ROOT / 'third_party' / 'sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    apache = get('https://raw.githubusercontent.com/apache/.github/main/LICENSE')
    (ROOT / 'LICENSE').write_bytes(apache)

if __name__ == '__main__':
    main()
