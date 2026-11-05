"""Validate handoff fixtures. Does not prove puzzle fairness or game implementation."""
import json
from pathlib import Path


def validate(path: Path) -> None:
    data = json.loads(path.read_text())
    assert data['schemaVersion'] == '1.1'
    assert data['status'] == 'draft_for_editorial_review'
    assert data['allFictional'] is True
    taxonomy = json.loads(path.with_name('discovery_taxonomy.json').read_text())
    assert data['taxonomyVersion'] == taxonomy['taxonomyVersion']
    theme_ids = {t['id'] for t in taxonomy['themes'] if t['status'] == 'enabled'}
    mood_ids = {t['id'] for t in taxonomy['moods'] if t['status'] == 'enabled'}
    difficulties = {t['id'] for t in taxonomy['difficulties']}
    assert len(theme_ids) == len(taxonomy['themes'])
    assert len({t['slug'] for t in taxonomy['themes']}) == len(theme_ids)
    assert len(mood_ids) == len(taxonomy['moods'])
    cases = data['cases']
    assert len({c['key'] for c in cases}) == len(cases)
    assert len({c['slug'] for c in cases}) == len(cases)
    for case in cases:
        suspects = {s['id'] for s in case['suspects']}
        reasons = {r['id'] for r in case['reasons']}
        assert len(suspects) == len(case['suspects'])
        assert len(reasons) == len(case['reasons'])
        assert case['answer']['suspectId'] in suspects
        assert case['answer']['reasonId'] in reasons
        assert set(case['answer']['eliminations']) == suspects - {case['answer']['suspectId']}
        assert case['modes'] and set(case['modes']) <= {'solo', 'group'}
        assert case['access'] in {'free', 'paid'}
        assert case['durationMinutes'] > 0
        discovery = case['discovery']
        assert 1 <= len(discovery['themes']) <= 3
        assert len(discovery['themes']) == len(set(discovery['themes']))
        assert set(discovery['themes']) <= theme_ids
        assert discovery['primaryTheme'] in discovery['themes']
        assert 1 <= len(discovery['moods']) <= 2
        assert len(discovery['moods']) == len(set(discovery['moods']))
        assert set(discovery['moods']) <= mood_ids
        assert discovery['difficulty'] in difficulties
        durations = discovery['estimatedDurationMinutes']
        assert set(durations) == set(case['modes'])
        assert all(type(v) is int and v > 0 for v in durations.values())
        assert case['durationMinutes'] == max(durations.values())
        assert isinstance(discovery['contentWarnings'], list)
        assert discovery['warningsReviewStatus'] in {'pending_editorial_review', 'reviewed'}
        assert [r['number'] for r in case['rounds']] == list(range(1, len(case['rounds']) + 1))
        clues = []
        hints = []
        for rd in case['rounds']:
            assert {h['tier'] for h in rd['hints']} == {1, 2}
            hints.extend(h['id'] for h in rd['hints'])
            for c in rd['clues']:
                assert c['round'] == rd['number']
                assert c['type'] == 'text' and c['body'].strip()
                assert c['visibility'] in {'assigned', 'public'}
                clues.append(c['id'])
            if 'group' in case['modes']:
                assigned = [c for c in rd['clues'] if c['visibility'] == 'assigned']
                for n in range(case['minPlayers'], case['maxPlayers'] + 1):
                    seats = [[] for _ in range(n)]
                    for i, c in enumerate(assigned):
                        seats[i % n].append(c['id'])
                    assert all(seats), (case['key'], rd['number'], n)
                    assert len({cid for seat in seats for cid in seat}) == len(assigned)
        assert len(set(clues)) == len(clues)
        assert len(set(hints)) == len(hints)
        assert set(case['answer']['decisiveClueIds']) <= set(clues)
        assert case['answer']['explanation'].strip()
        print(f"PASS {case['key']}: {len(case['rounds'])} rounds, {len(clues)} clues; answer references, distributions and discovery metadata valid")
    print(f"Validated {len(cases)} draft cases. Editorial review and blind playtests still required.")


if __name__ == '__main__':
    validate(Path(__file__).with_name('starter_cases.json'))
