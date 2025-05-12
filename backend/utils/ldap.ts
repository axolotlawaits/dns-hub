import { createClient, SearchEntry, SearchOptions } from 'ldapjs';
import { NextFunction, Request, Response } from "express";

export async function ldapAuth(req: Request, res: Response, next: NextFunction): Promise<any>  {
  const { login, pass } = req.body;
  
  if (!login || !pass) {
    return res.status(400).send({ message: 'Login and password are required' });
  }

  const client = createClient({
    url: 'ldap://ural-dc01.partner.ru',
    reconnect: true
  });

  try {
    // First bind with user credentials
    await new Promise<void>((resolve, reject) => {
      client.bind(`${login}@dns-shop.ru`, pass, (err) => {
        if (err) {
          console.error('LDAP bind error:', err);
          reject(new Error('Invalid credentials'));
        } else {
          resolve();
        }
      });
    });

    // Then search for user attributes
    const user = await new Promise<any>((resolve, reject) => {
      const searchOptions: SearchOptions = {
        filter: `(sAMAccountName=${login})`,
        scope: 'sub',
        attributes: ['department', 'displayName', 'description', 'mail', 'thumbnailPhoto']
      };

      client.search('OU=DNS Users,DC=partner,DC=ru', searchOptions, (err, res) => {
        if (err) {
          console.error('LDAP search error:', err);
          reject(err);
          return;
        }

        let userFound = false;
        
        res.on('searchEntry', (entry: SearchEntry) => {
          userFound = true;

          const department = getFirstAttributeValue(entry, 'department');
          const displayName = getFirstAttributeValue(entry, 'displayName');
          const description = getFirstAttributeValue(entry, 'description');
          const mail = getFirstAttributeValue(entry, 'mail');
          const thumbnailPhoto = getFirstBinaryValue(entry, 'thumbnailPhoto');

          resolve({
            department,
            displayName,
            description,
            mail,
            thumbnailPhoto: thumbnailPhoto ? Buffer.from(thumbnailPhoto).toString('base64') : null
          });
        });
        res.on('error', (err) => {
          console.error('LDAP search stream error:', err);
          reject(err);
        });

        res.on('end', () => {
          if (!userFound) {
            reject(new Error('User not found in directory'));
          }
        });
      });
    });

    res.locals.user = user;
    next();
  } catch (error) {
    console.error('LDAP authentication failed:', error);
    return res.status(401).send({ message: 'Authentication failed' });
  } finally {
    client.unbind();
  }
}

function getFirstAttributeValue(entry: SearchEntry, attributeName: string): string | null {
  const attr = entry.attributes.find(attr => attr.type === attributeName);
  return attr?.values?.[0] ?? null;
}

function getFirstBinaryValue(entry: SearchEntry, attributeName: string): Buffer | null {
  const attr = entry.attributes.find(attr => attr.type === attributeName);
  return attr?.buffers?.[0] ?? null;
}