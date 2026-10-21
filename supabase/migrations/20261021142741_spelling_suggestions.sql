-- "Did you mean ...?" for guesses that aren't in the word list.
--
-- Candidates come from a trigram index and are ranked by edit distance, with
-- a bonus for words that sound the same (Double Metaphone: elefant -> elephant
-- rather than elegant, recieve -> receive rather than relieve), then by how
-- common the word is. They are deliberately not ranked by closeness to the
-- clues: that would let a player fish for answers with misspellings.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

create index words_word_trgm_idx on public.words using gin (word extensions.gin_trgm_ops);

-- Up to p_limit guessable words within edit distance 2 of p_word (1 for words
-- of 4 letters or fewer, where 2 edits make almost anything match), or one
-- more edit for a word that sounds the same.
create function public.suggest_words(p_word text, p_limit int default 5)
returns table (word text, distance int)
language sql
stable
set search_path = ''
set pg_trgm.similarity_threshold = 0.25
as $$
  select w.word, d.distance
    from public.words w
   cross join lateral (
     select extensions.levenshtein(w.word, p_word) as distance,
            extensions.dmetaphone(w.word) = extensions.dmetaphone(p_word) as sounds_alike
   ) d
   where w.word operator(extensions.%) p_word
     and d.distance <= case when length(p_word) <= 4 then 1 else 2 end + d.sounds_alike::int
   order by d.distance - 1.5 * d.sounds_alike::int, w.freq_rank
   limit p_limit
$$;

revoke execute on function public.suggest_words(text, int) from public, anon, authenticated;
grant execute on function public.suggest_words(text, int) to service_role;
