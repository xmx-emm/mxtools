import {onBeforeUnmount, onMounted} from 'vue';

function DisableRightClick() {
  function disableRightClick(event: Event) {
    event.preventDefault();
  }

  onMounted(() => {
    document.addEventListener('contextmenu', disableRightClick);

  });
  onBeforeUnmount(() => {
      document.removeEventListener('contextmenu', disableRightClick);
    }
  );
}

export {
  DisableRightClick,
};
