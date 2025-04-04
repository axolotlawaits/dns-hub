from ldap3 import Server, Connection, NTLM
from ldap3.core.exceptions import LDAPBindError
import sys, json

username, password = sys.argv[1], sys.argv[2]

def authenticate_ldap(username: str, password: str) -> dict[str, str, str]:
    try:
        conn = Connection(
            'ural-dc1.partner.ru', user=f"partner.ru\\{username}",
            password=password, authentication=NTLM,
            auto_bind=True
        )
        conn.search(
            'dc=partner,dc=ru', f'(sAMAccountName={username})',
            attributes=['department', 'displayName', 'description']
        )
        name = conn.entries[0].displayName
        filial = conn.entries[0].department
        pos = conn.entries[0].description

    except Exception as e:
        print(e)
        return 
    
    data_user = json.dumps({
        'name': str(name),
        'branch': str(filial),
        'position': str(pos)
    }, ensure_ascii = False)

    return data_user

print(authenticate_ldap(username, password))