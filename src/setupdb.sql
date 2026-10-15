create or replace function get_relevant_chunks(
  query_vector vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  url text,
  date_updated timestamp,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    url,
    date_updated,
    1 - (chunks.vector <=> query_vector) as similarity
  from chunks
  where 1 - (chunks.vector <=> query_vector) > match_threshold
  order by similarity desc
  limit match_count;
$$;