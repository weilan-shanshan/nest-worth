# Legacy MIT License Notice

## Background

Nestworth was originally released under the **MIT License** from the start of
the project (2026-05-10) up to and including the commit tagged
`v0.2.1-final-mit` (commit `f6e6500`, dated 2026-05-17).

Starting from the commit that follows `v0.2.1-final-mit`, Nestworth is
licensed under the **Business Source License 1.1 (BUSL-1.1)**, with the
Change License set to AGPL-3.0-or-later and a Change Date of four years from
each version's first public release. See [`LICENSE`](./LICENSE) for the full
text.

## What this means in practice

### For code at or before `v0.2.1-final-mit`

- Any code present in this repository at commit `f6e6500` (tag
  `v0.2.1-final-mit`) or any earlier commit remains licensed under the
  MIT License.
- Anyone who obtained a copy of that code under MIT may continue to use,
  copy, modify, merge, publish, distribute, sublicense, and/or sell copies
  of that historical snapshot under the original MIT terms.
- This grant cannot be revoked retroactively. The MIT license once granted
  on those commits remains valid for those commits.

### For code added after `v0.2.1-final-mit`

- All new code, bug fixes, features, and modifications introduced after
  commit `f6e6500` are licensed under BUSL-1.1.
- Personal and internal non-competitive use is permitted free of charge
  under the Additional Use Grant in the LICENSE file.
- Offering the Licensed Work as a hosted or managed service in competition
  with Licensor's paid offerings requires a separate commercial license.

### Practical implication for forks

If you fork Nestworth based on a commit at or before `f6e6500`, your fork
remains MIT-licensed for whatever code you took. However, any code you pull
in from this repository after `f6e6500` is BUSL-1.1 and subject to its terms.

In other words: the MIT "snapshot" is preserved forever at
`git checkout v0.2.1-final-mit`. Everything beyond that point is BUSL-1.1.

## Why the change

Nestworth is moving toward a sustainable commercial model that funds
ongoing development, model integrations, and infrastructure costs. The
BUSL-1.1 license was chosen because it:

1. Keeps the source code publicly readable (auditable for our privacy
   claims).
2. Permits unrestricted personal, family, and internal-organization use.
3. Restricts only the specific scenario of third-party hosted SaaS
   competition.
4. Automatically converts to a true open source license (AGPL-3.0-or-later)
   four years after each version's release, ensuring the codebase
   eventually returns to the open source commons.

## Contact

For commercial licensing inquiries, please contact:
`huoqilei.hql@alibaba-inc.com`
