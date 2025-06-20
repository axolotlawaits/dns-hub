import { Notification } from '@mantine/core'

function NoAccess() {
  return (
    <Notification title="У вас нет доступа к инструменту" withCloseButton={false}>
      Вы можете запросить его у отвественного лица
    </Notification>
  )
}

export default NoAccess