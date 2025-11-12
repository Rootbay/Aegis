from pathlib import Path
from textwrap import dedent
path = Path('src/lib/components/sidebars/ServerSidebar.svelte')
text = path.read_text()
start_marker = "          {@const textSectionMuted"
end_marker = "          {@const categories = getSortedCategories()}"
start = text.index(start_marker)
end = text.index(end_marker)
block_slice = text[start:end]

def extract_list_block(marker, after=0):
    search_slice = block_slice
    if after:
        search_slice = block_slice[after:]
    role_idx = search_slice.index(marker)
    abs_idx = (after or 0) + role_idx
    div_start = block_slice.rfind('<div', 0, abs_idx)
    if div_start == -1:
        raise SystemExit('list container not found for ' + marker)
    depth = 1
    idx = div_start + 4
    while idx < len(block_slice):
        next_open = block_slice.find('<div', idx)
        next_close = block_slice.find('</div>', idx)
        if next_close == -1:
            raise SystemExit('closing div not found for ' + marker)
        if next_open != -1 and next_open < next_close:
            depth += 1
            idx = next_open + 4
            continue
        depth -= 1
        idx = next_close + len('</div>')
        if depth == 0:
            return block_slice[div_start:idx]
    raise SystemExit('matching div not found for ' + marker)
text_list = extract_list_block('role="list"')
voice_start = block_slice.index('{{@const voiceSectionMuted')
voice_list = extract_list_block('role="list"', after=voice_start)

def reindent_block(block, indent):
    lines = block.splitlines()
    return '\n'.join(indent + line.lstrip() if line.strip() else line for line in lines)
text_list = reindent_block(text_list, '            ')
voice_list = reindent_block(voice_list, '            ')
categories_block = text[end:]
new_sections = dedent(f"""
          {{@const uncategorizedTextChannels = getVisibleChannels(null, \"text\")}}
          <div class=\"space-y-2 mt-4\">
            <div class=\"flex items-center justify-between py-1\">
              <span class=\"text-sm font-semibold text-muted-foreground uppercase\">
                Text Channels
              </span>
              <Button
                variant=\"ghost\"
                size=\"icon\"
                aria-label=\"Create Channel\"
                onclick={{() => handleCreateChannelClick(\"text\", null)}}
              >
                <Plus size={12} />
              </Button>
            </div>
{text_list}
          </div>

          {{@const uncategorizedVoiceChannels = getVisibleChannels(null, \"voice\")}}
          <div class=\"space-y-2 mt-4\">
            <div class=\"flex items-center justify-between py-1\">
              <span class=\"text-sm font-semibold text-muted-foreground uppercase\">
                Voice Channels
              </span>
              <Button
                variant=\"ghost\"
                size=\"icon\"
                aria-label=\"Create Voice Channel\"
                onclick={{() => handleCreateChannelClick(\"voice\", null)}}
              >
                <Plus size={12} />
              </Button>
            </div>
{voice_list}
          </div>
""")
path.write_text(text[:start] + new_sections + categories_block)
