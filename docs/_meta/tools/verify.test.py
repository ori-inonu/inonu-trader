"""Isolated synthetic-fixture tests for the wiki validator, never product evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('wiki_verify', Path(__file__).with_name('verify.py'))
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load sibling wiki validator')
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
SCRATCH = Path('C:/Users/gabri/AppData/Local/hermes/cache/scratch')


def page(title, body, sources=None):
    return '\n'.join(['---','title: '+json.dumps(title),'created: 2026-10-13','updated: 2026-10-13','type: concept','tags: ["documentacao"]','sources: '+json.dumps(sources or ['docs/source.md']), 'confidence: medium','---','',body,''])


class WikiChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='docs-wiki-fixture-', dir=SCRATCH)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.docs = self.root/'docs'
        self.write('docs/source.md', '# Synthetic test source\n')
        source_bytes = (self.docs/'source.md').read_bytes()
        self.baseline = {'files':[{'path':'docs/source.md','sha256':hashlib.sha256(source_bytes).hexdigest(),'bytes':len(source_bytes),'hidden':False}]}
        self.catalog = {'source_files':1,'documents':1,'supporting_artifacts':0,'files':[{'path':'docs/source.md','sha256':self.baseline['files'][0]['sha256'],'extension':'.md','lines':1}]}
        self.write('docs/SCHEMA.md',page('Schema','- `documentacao`\n\n[[a]] [[b]]'))
        self.write('docs/index.md',page('Index','[[a]] [[b]]\n\n[_meta/catalogs/fixture](_meta/catalogs/fixture.md)'))
        self.write('docs/log.md',page('Log','[[a]] [[b]]\n\n## [2026-10-13] create | synthetic fixture'))
        self.write('docs/_meta/topic-map.md',page('Topic map','[[a]] [[b]]\n\n[[_meta/catalogs/fixture]]'))
        self.write('docs/concepts/a.md',page('A','[[b]] [[index]]\n\n[Source](../source.md)'))
        self.write('docs/concepts/b.md',page('B','[[a]] [[index]]'))
        self.write('docs/_meta/catalogs/fixture.md',page('Catalog','[[a]] [[b]]\n\n[Source](../../source.md)'))
        self.write_json('docs/_meta/source-manifest-20261013.json',self.baseline)
        self.write_json('docs/_meta/catalog.json',self.catalog)
        generated=sorted(p.relative_to(self.root).as_posix() for p in self.docs.rglob('*') if p.is_file() and p.name!='source.md')
        generated.append('docs/_meta/generated-files.json')
        self.write_json('docs/_meta/generated-files.json',{'files':generated})

    def write(self,path,content):
        target=self.root/path
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(content,encoding='utf-8')
        return content

    def write_json(self,path,value):
        self.write(path,json.dumps(value))

    def checks(self):
        return verify.collect_checks(self.root)

    def codes(self):
        return {entry['code'] for entry in self.checks()['errors']}

    def test_valid_fixture(self):
        result=self.checks()
        self.assertTrue(result['ok'],result['errors'])
        self.assertEqual(result['checks']['rendered_catalog_source_links'],1)

    def test_original_change_detected(self):
        self.write('docs/source.md','# Changed synthetic source\n')
        self.assertIn('original_hash_drift',self.codes())

    def test_registered_original_change_is_visible_but_not_byte_preserved(self):
        changed = self.write('docs/source.md','# Changed synthetic source\n')
        receipt_path = 'docs/_meta/source-drift-20261013.json'
        self.write_json(receipt_path, {'format':'docs-source-drift-v1','records':[{
            'path':'docs/source.md',
            'baseline_sha256':self.baseline['files'][0]['sha256'],
            'current_sha256':verify.sha256(self.docs/'source.md'),
            'bytes':(self.docs/'source.md').stat().st_size
        }]})
        generated = json.loads((self.docs/'_meta/generated-files.json').read_text(encoding='utf-8'))
        generated['files'].append(receipt_path)
        self.write_json('docs/_meta/generated-files.json', generated)
        result = self.checks()
        self.assertTrue(result['ok'], result['errors'])
        self.assertFalse(result['preservation_ok'])
        self.assertTrue(result['drift_inventory_ok'])
        self.assertIn('registered_original_hash_drift', {item['code'] for item in result['warnings']})

    def test_sensitive_source_is_never_hashed_or_opened(self):
        relative = 'docs/sdd/mesa-decisao-20261013/credential-evidence.md'
        sensitive = self.root/relative
        sensitive.parent.mkdir(parents=True)
        sensitive.write_text('synthetic sensitive fixture, not a real credential', encoding='utf-8')
        original_hash = verify.sha256(sensitive)
        original_bytes = sensitive.stat().st_size
        self.baseline['files'].append({'path':relative,'sha256':original_hash,'bytes':original_bytes,'hidden':False})
        self.write_json('docs/_meta/source-manifest-20261013.json', self.baseline)
        self.catalog['source_files'] = 2
        self.catalog['documents'] = 2
        self.catalog['files'].append({'path':relative,'sha256':original_hash,'extension':'.md','lines':0})
        self.write_json('docs/_meta/catalog.json', self.catalog)
        self.write_json('docs/_meta/document-status.json', {'files':[{'path':relative,'read_mode':'not_opened_sensitive'}]})
        generated_path = self.docs/'_meta/generated-files.json'
        generated = json.loads(generated_path.read_text(encoding='utf-8'))
        generated['files'].append('docs/_meta/document-status.json')
        self.write_json('docs/_meta/generated-files.json', generated)
        self.write('docs/_meta/catalogs/fixture.md', page('Catalog', '[[a]] [[b]]\n[Source](../../source.md)\n[Credential evidence](../../sdd/mesa-decisao-20261013/credential-evidence.md)'))
        original_sha = verify.sha256
        def guarded_sha(path):
            if path.resolve() == sensitive.resolve():
                raise AssertionError('sensitive source content was read')
            return original_sha(path)
        with patch.object(verify, 'sha256', side_effect=guarded_sha):
            result = self.checks()
        self.assertTrue(result['ok'], result['errors'])
        self.assertFalse(result['preservation_ok'])
        self.assertEqual(result['checks']['sensitive_sources_unverified'], 1)
        self.assertIn('sensitive_source_not_hashed', {item['code'] for item in result['warnings']})

    def test_original_removal_detected(self):
        (self.docs/'source.md').unlink()
        self.assertIn('original_missing',self.codes())

    def test_unassigned_source_detected(self):
        self.write('docs/unassigned.md','# New synthetic source\n')
        self.assertIn('uncatalogued_new_files',self.codes())

    def test_catalog_duplicate_detected(self):
        self.catalog['files'].append(dict(self.catalog['files'][0]))
        self.write_json('docs/_meta/catalog.json',self.catalog)
        self.assertIn('duplicate_catalog_paths',self.codes())

    def test_broken_markdown_link_detected(self):
        self.write('docs/concepts/a.md',page('A','[[b]] [[index]]\n[Missing](../not-present.md)'))
        self.assertIn('broken_markdown_link',self.codes())

    def test_broken_wikilink_detected(self):
        self.write('docs/concepts/a.md',page('A','[[b]] [[not-present]]'))
        self.assertIn('broken_or_ambiguous_wikilink',self.codes())

    def test_missing_frontmatter_detected(self):
        self.write('docs/concepts/a.md','# A\n[[b]] [[index]]\n')
        self.assertIn('frontmatter_missing',self.codes())

    def test_unknown_tag_detected(self):
        text=page('A','[[b]] [[index]]').replace('["documentacao"]','["not-in-schema"]')
        self.write('docs/concepts/a.md',text)
        self.assertIn('unknown_tag',self.codes())

    def test_missing_rendered_catalog_entry_detected(self):
        self.write('docs/_meta/catalogs/fixture.md',page('Catalog','[[a]] [[b]]'))
        self.assertIn('rendered_catalog_coverage',self.codes())

    def test_orphan_detected(self):
        self.write('docs/index.md',page('Index','[[b]] [[log]]\n[_meta/catalogs/fixture](_meta/catalogs/fixture.md)'))
        self.write('docs/concepts/b.md',page('B','[[log]] [[index]]'))
        self.write('docs/SCHEMA.md',page('Schema','- `documentacao`\n[[b]] [[log]]'))
        self.write('docs/log.md',page('Log','[[b]] [[index]]'))
        self.write('docs/_meta/topic-map.md',page('Map','[[b]] [[log]]\nfixture'))
        self.write('docs/_meta/catalogs/fixture.md',page('Catalog','[[b]] [[log]]\n[Source](../../source.md)'))
        self.assertIn('orphan_page',self.codes())

    def test_size_and_typography_detected(self):
        self.write('docs/concepts/a.md',page('A','[[b]] [[index]]\n'+('line\n'*205)+'\n\u2014'))
        self.assertIn('generated_page_too_large',self.codes())
        self.assertIn('forbidden_typography',self.codes())

    def test_multiline_json_sources(self):
        text = page('A', '[[b]] [[index]]').replace('["docs/source.md"]', '[\n  "docs/source.md"\n]')
        fields, _ = verify.frontmatter(text)
        self.assertEqual(fields['sources'], ['docs/source.md'])
        self.write('docs/concepts/a.md', text)
        self.assertTrue(self.checks()['ok'])

    def test_block_yaml_sources(self):
        text = page('A', '[[b]] [[index]]').replace('sources: ["docs/source.md"]', 'sources:\n  - "docs/source.md"')
        self.assertEqual(verify.frontmatter(text)[0]['sources'], ['docs/source.md'])
        self.write('docs/concepts/a.md', text)
        self.assertTrue(self.checks()['ok'])

    def test_navigation_requires_link_not_substring(self):
        self.write('docs/index.md', page('Index', '[[b]] [[log]]\n a is mentioned as text'))
        self.write('docs/_meta/topic-map.md', page('Map', '[[b]] [[log]]\n[[_meta/catalogs/fixture]]'))
        self.assertIn('page_missing_from_index', self.codes())

    def test_catalog_limit(self):
        self.write('docs/_meta/catalogs/fixture.md', page('Catalog', '[[a]] [[b]]\n' + ('| [Source](../../source.md) | source |\n' * 51)))
        self.assertIn('catalog_page_too_large', self.codes())

    def test_duplicate_generated_paths(self):
        path = self.docs/'_meta/generated-files.json'
        receipt = json.loads(path.read_text(encoding='utf-8'))
        receipt['files'].append(receipt['files'][0])
        self.write_json('docs/_meta/generated-files.json', receipt)
        self.assertIn('duplicate_generated_paths', self.codes())

    def test_drift_not_hidden_by_navigation_success(self):
        self.write('docs/source.md', '# Changed synthetic source\n')
        result = self.checks()
        self.assertTrue(result['navigation_ok'])
        self.assertFalse(result['preservation_ok'])
        self.assertFalse(result['ok'])

    def test_inline_code_is_not_a_link_or_provenance(self):
        self.write('docs/concepts/a.md', page('A', '[[b]] [[index]]\nExamples: `[[not-present]]` and `^[docs/not-present.md]`.'))
        self.assertTrue(self.checks()['ok'])


if __name__=='__main__':
    unittest.main(verbosity=2)
