<script lang="ts">
  export let data: string;
  export let size: string | number = '6';
  export let clazz: string = '';
</script>

<div class="inline-block" style:width="{+size/4}rem" style:height="{+size/4}rem">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    class={clazz}
  >
    <path d={data}></path>
  </svg>
</div>