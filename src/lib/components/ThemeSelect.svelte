<script lang="ts">
  /**
   * Theme Switcher [modern]
   * @see
   * - https://wicg.github.io/web-preferences-api/
   * - https://github.com/bramus/chrome-dark-mode-toggle
   * - https://www.bram.us/2024/04/21/css-color-scheme-dependent-colors-with-light-dark/
   */
</script>

<div class="group flex items-center border border-solid">
  <label id="l1" for="theme-select">
    Оформление:&nbsp;
  </label>
  <!-- https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA9 -->
  <select
    id="theme-select"
    name="color-scheme"
    class="theme cursor-pointer py-1 px-2"
    title="Изменить тему оформления интерфейса"
    aria-labelledby="l1 theme-select"
  >
    <!-- Светлая тема -->
    <option value="light">Светлое</option>
    <!-- Тёмная тема; ночной режим -->
    <option value="dark">Тёмное</option>
    <!-- Вариант по умолчанию • Системная тема -->
    <option value="light dark" selected>Авто</option>
    <hr />
    <!-- Принудительно установить… -->
    <option value="monochrome">Монохромное</option>
    <!-- <option value="dimmed">Dim</option> -->
  </select>
</div>

<style>
  /* … */
</style>
