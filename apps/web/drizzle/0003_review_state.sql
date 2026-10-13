-- Projects still on the stock build-it states gain `review` after `testing`.
UPDATE `projects`
SET `config` = JSON_ARRAY_INSERT(
	`config`,
	'$.states[4]',
	CAST('{"key":"review","label":"In review","color":"#7dd3fc","kind":"review","icon":"◎","animation":"none"}' AS JSON)
)
WHERE JSON_UNQUOTE(JSON_EXTRACT(`config`, '$.states[3].key')) = 'testing'
	AND JSON_CONTAINS(JSON_EXTRACT(`config`, '$.states[*].key'), '"review"') = 0;
