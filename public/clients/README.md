# Client logos

Drop the real client logo files here. Each filename must match the `logo` path in
`lib/content.ts` (`CLIENTS`). SVG is preferred (sharp at any size); transparent PNG is
fine. Until a file exists, the strip shows the client's localized name as a text wordmark.

**The logo strip is on a DARK background** (`bg-ink`). Use **white / light, transparent**
logo variants so they're visible. Aim for a transparent background and ~36–80px of actual
artwork height.

Already added:

- White-on-transparent: `anani.png`, `design-museum-holon.svg`; `ein-harod.png` and
  `elephant.png` were converted from black-on-white art to white silhouettes.
- Full color, transparent background (kept in color, brand-accurate): `keshet.png`
  (white bg knocked out), `story.png`, `teddy.png`, `artza.png`.

| File                              | Client (he)              | Client (en)                            |
| --------------------------------- | ------------------------ | -------------------------------------- |
| `artza.svg`                       | ארצה הפקות                | Artza Productions                      |
| `anani.svg`                       | ענני תקשורת               | Anani Communications                   |
| `teddy.svg`                       | טדי הפקות                 | Teddy Productions                      |
| `gil.svg`                         | גיל הפקות                 | Gil Productions                        |
| `keshet.svg`                      | שידורי קשת                | Keshet Broadcasting                    |
| `shufra.svg`                      | שופרא                     | Shufra                                 |
| `story.svg`                       | סטורי                     | Story                                  |
| `aluf.svg`                        | אלוף אינטרנשיונל          | Aluf International                      |
| `elephant.svg`                    | אלפנט לאבס                | Elephant Labs                          |
| `ta-museum.svg`                   | מוזיאון תל אביב           | Tel Aviv Museum of Art                 |
| `design-museum-holon.svg`         | מוזיאון העיצוב חולון      | Design Museum Holon                    |
| `rg-museum.svg`                   | מוזיאון רמת גן            | Ramat Gan Museum of Art                |
| `islam-museum.svg`                | מוזיאון האסלאם באר שבע    | Museum of Islamic Culture, Be'er Sheva |
| `ein-harod.svg`                   | המשכן לאמנות עין חרוד     | Mishkan Museum of Art, Ein Harod       |

If a logo is only available as PNG, change the extension in `lib/content.ts` to match
(e.g. `/clients/keshet.png`).
