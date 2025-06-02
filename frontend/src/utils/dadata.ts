const fetchDaData = async (query: string, token: string) => {
    try {
      const response = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({ query }),
      });
  
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
  
      const result = await response.json();
      return result.suggestions.map((suggestion: { data: any; }) => suggestion.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      return [];
    }
  };
  
  // Example usage
  const token = 'df05d295978e69d7d403c8df63334231aefeb164'; // Replace with your actual token
  const query = 'Сбербанк'; // Example query
  
  fetchDaData(query, token)
    .then(data => {
      console.log(data); // This will log the array of data
    });
  