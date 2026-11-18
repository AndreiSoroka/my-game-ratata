# Hero name catalog

The game selects from a reviewed local pool; it does not run Python, download names, or call a service.
Russian and English pools are separate. A first random draw chooses a short name or a name with a
fantasy byname with equal probability. A second draw selects a different candidate in that format.
Only complete names up to 24 JavaScript UTF-16 code units are included; names are never truncated.
The bynames use noun phrases, without assigning the hero a gender, profession, or ability.

The selected given names are adapted from [Tiendil/pynames](https://github.com/Tiendil/pynames),
revision [`b799ba1d11a75c010b4f56fe8ddb984ddd3673ef`](https://github.com/Tiendil/pynames/tree/b799ba1d11a75c010b4f56fe8ddb984ddd3673ef):

- [`pynames/generators/fixtures/elven_dnd_names_tables.json`](https://github.com/Tiendil/pynames/blob/b799ba1d11a75c010b4f56fe8ddb984ddd3673ef/pynames/generators/fixtures/elven_dnd_names_tables.json):
  16 reviewed short combinations of a prefix and a final suffix, following the two-part templates.
  The upstream fixture credits its [original name table](http://www.angelfire.com/rpg2/vortexshadow/names.html)
  and Russian translation by Wizard-worker and Swingaroo.
- [`pynames/generators/fixtures/scandinavian_names_list.json`](https://github.com/Tiendil/pynames/blob/b799ba1d11a75c010b4f56fe8ddb984ddd3673ef/pynames/generators/fixtures/scandinavian_names_list.json):
  16 selected Russian nominative forms and their English counterparts.
- [`pynames/generators/fixtures/pagan_names_list.json`](https://github.com/Tiendil/pynames/blob/b799ba1d11a75c010b4f56fe8ddb984ddd3673ef/pynames/generators/fixtures/pagan_names_list.json):
  16 selected Russian nominative forms and their English counterparts.

The fantasy bynames and TypeScript selection code are original to this project. The original
`FromListGenerator`, `Template.get_name` and `Name.get_for` implementations were reviewed to select
the source forms; no upstream Python runtime or dependency is included.

Upstream copyright: **Copyright (c) 2012, Yaletski Aliaksei. All rights reserved.**
The complete upstream BSD-3-Clause notice is retained in
[`public/licenses/pynames-BSD-3-Clause.txt`](../../../public/licenses/pynames-BSD-3-Clause.txt)
and is included in the frontend distribution at `/licenses/pynames-BSD-3-Clause.txt`.
