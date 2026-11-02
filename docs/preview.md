# Digest preview

Generate the single HTML file from rig's localhost HTTP app, outside the repository:

```sh
pnpm preview /tmp/rig-review/index.html
```

The command loads `.env` through the runtime, just like `pnpm start`. Do not commit or attach
the HTML. It includes only the sample night and lane banner; no client JavaScript or remote
assets are needed.

For cleanup, regenerate without the marker:

```sh
pnpm preview /tmp/rig-review/index.html --without-marker
```

## Public hosting

The manual `Publish digest preview` workflow deploys the exported HTML to GitHub Pages.
It never runs on push. Before enabling Pages or starting either upload, ask the human:
what will be public, why, where it will appear, who can see it, and how to undo it.

After the initial upload is approved, enable Pages with GitHub Actions as its source and
set the repository secret `LANE_MARKER`. Run the workflow with `include_marker=true`.
The HTML is built in the runner's temporary directory, never committed, and its temporary
Actions upload artifact is deleted after deployment. The public link is replaceable.

After review and separate human approval, run the workflow again with
`include_marker=false`. Check the same public URL shows `no marker set` and does not
contain the marker, then remove the repository marker secret. Pages can be unpublished
from the repository's Pages settings.

Use a new source commit for a replacement, even when only the export environment changes.
Pages identifies a deployment by its source commit; repeated manual uploads at the same
commit can report success while the previous HTML remains live
([deploy-pages issue 383](https://github.com/actions/deploy-pages/issues/383)). Verify the
public response itself before closing the cleanup issue or archiving the plan.

References: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[deleting upload artifacts](https://docs.github.com/en/rest/actions/artifacts#delete-an-artifact).
