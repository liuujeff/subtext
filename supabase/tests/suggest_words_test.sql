-- suggest_words: spelling suggestions for guesses that aren't in the list.
begin;
select plan(6);

-- Made-up words so uploaded data never interferes. freq_rank: lower = more common.
insert into public.words (id, word, freq_rank, in_pool, hub, embedding)
select 9200000 + i, w, r, true, 0,
       extensions.l2_normalize((array[1, 0] || array_fill(0::real, array[298]))::extensions.halfvec(300))
  from (values (1, 'qqwagon', 9200100), (2, 'qqwagen', 9200001), (3, 'qqwagons', 9200050),
               (4, 'qqab', 9200010), (5, 'qqcd', 9200011),
               (6, 'qqelegant', 9200002), (7, 'qqelephant', 9200003)) v(i, w, r);

select results_eq(
  $$select word from public.suggest_words('qqwagin') where word like 'qq%'$$,
  array['qqwagen', 'qqwagon', 'qqwagons'],
  'closest spelling first, then the more common word'
);
select is((select distance from public.suggest_words('qqwagin') where word = 'qqwagons'), 2,
  'reports the edit distance');
select is_empty($$select * from public.suggest_words('qqzzzzzzz') where word like 'qq%'$$,
  'nothing for a word with no close spelling');
select is((select count(*)::int from public.suggest_words('qqwagin', 1)), 1, 'respects the limit');
select results_eq(
  $$select word from public.suggest_words('qqax') where word like 'qq%'$$,
  array['qqab'],
  'short words allow only one edit'
);

select is((select word from public.suggest_words('qqelefant') limit 1), 'qqelephant',
  'a word that sounds the same beats a closer spelling that does not');

select * from finish();
rollback;
